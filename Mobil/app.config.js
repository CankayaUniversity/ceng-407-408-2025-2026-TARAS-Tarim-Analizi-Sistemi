const useLocal = process.env.USE_LOCAL_API === "true";
const apiHost = useLocal
  ? process.env.API_HOST_LOCAL
  : process.env.API_HOST_AWS;
// REMOVE-ON-SDK56 — useHermesV1 const + expo-build-properties.{buildReactNativeFromSource,useHermesV1} entries
const useHermesV1 = process.env.USE_HERMES_V1 === "true";

const plugins = [
  [
    "react-native-vision-camera",
    {
      cameraPermissionText: "Bitki hastalığı tespiti için kamera erişimi gereklidir.",
      enableMicrophonePermission: false,
    },
  ],
  "./plugins/withNetworkSecurityConfig.js",
  "./plugins/withDefaultLocaleStrings.js",
  ["react-native-ble-plx", { neverForBackground: true }],
  [
    "expo-build-properties",
    {
      buildReactNativeFromSource: useHermesV1,
      useHermesV1,
      android: {
        cmake: "3.22.1",
      },
    },
  ],
  // Tum Android build-gradle patches tek umbrella plugin altinda
  // (ordering + REMOVE-ON-SDK56 gate plugin icinde)
  ["./plugins/withTarasAndroid.js", { useHermesV1 }],
  "@react-native-community/datetimepicker",
  "expo-sharing",
  // Sadece API anahtari varsa kayit ol — bos/eksik anahtar AndroidManifest'e
  // empty <meta-data android:value="" /> koyup Gradle build'i patlatiyordu
  // (ve runtime'da Google Maps SDK "Authentication failure" atiyor).
  // Anahtar yoksa Maps pluginini hic mount etmiyoruz; CreateFarm'in MapView'i
  // graceful sekilde fallback verir. iOS Apple Maps kullanir, anahtar gerekmez —
  // dolayisiyla bu dallandirma yalnizca Android'i etkiler.
  // ⚠ Plugin prop'unun ismi `androidGoogleMapsApiKey` (NOT `androidApiKey` — eski config
  // buradaki yanlis isim yuzunden meta-data hic injecte edilmedi, runtime'da boş harita ve
  // crash; bkz. node_modules/react-native-maps/plugin/build/android.js — `if (props?.androidGoogleMapsApiKey)`).
  ...(process.env.GOOGLE_MAPS_API_KEY
    ? [
        [
          "react-native-maps",
          { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY },
        ],
      ]
    : []),
  [
    "expo-location",
    {
      locationAlwaysAndWhenInUsePermission:
        "Çiftlik konumunu belirlemek için konum erişimi gereklidir.",
      locationWhenInUsePermission:
        "Çiftlik konumunu belirlemek için konum erişimi gereklidir.",
    },
  ],
];

// ── App version ──────────────────────────────────────────────────────
// Yeni surum yayinlarken APP_VERSION ve APP_VERSION_CODE'u guncelle.
// APP_VERSION: kullaniciya gosterilir (semver)
// APP_VERSION_CODE: Android internal versionCode — her surumde +1 olmali
const APP_VERSION = "0.8.2";
//const APP_VERSION_CODE = 2;

module.exports = {
  expo: {
    name: "Taras",
    slug: "taras",
    version: APP_VERSION,
    assetBundlePatterns: ["**/*"],
    userInterfaceStyle: "automatic",
    plugins,
    locales: {
      tr: "./locales/tr.json",
      en: "./locales/en.json",
    },
    ios: {
      supportsTabletMode: true,
      bundleIdentifier: "com.taras.app",
      //buildNumber: String(APP_VERSION_CODE),
      userInterfaceStyle: "automatic",
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
      },
    },
    android: {
      package: "com.taras.app",
      //versionCode: APP_VERSION_CODE,
      userInterfaceStyle: "automatic",
      usesCleartextTraffic: false,
      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "BLUETOOTH_SCAN",
        "BLUETOOTH_CONNECT",
        "ACCESS_FINE_LOCATION",
      ],
    },
    extra: {
      apiHost,
      useLocalApi: useLocal,
      demoUsername: process.env.DEMO_USERNAME,
      demoPassword: process.env.DEMO_PASSWORD,
      awsDemoUsername: process.env.AWS_DEMO_USERNAME,
      awsDemoPassword: process.env.AWS_DEMO_PASSWORD,
      // DEMO_ONLY=true → DemoOnlyLoginScreen render edilir (input + register gizlenir)
      demoOnly: process.env.DEMO_ONLY === "true",
    },
  },
};
