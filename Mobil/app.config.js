const useLocal = process.env.USE_LOCAL_API === "true";
const apiHost = useLocal
  ? process.env.API_HOST_LOCAL
  : process.env.API_HOST_AWS;
const useHermesV1 = process.env.USE_HERMES_V1 === "true";

const plugins = [
  [
    "expo-camera",
    {
      cameraPermission: "Bitki hastalığı tespiti için kamera erişimi gereklidir.",
      enableBarcodeScanner: false,
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
];

// ── App version ──────────────────────────────────────────────────────
// Yeni surum yayinlarken APP_VERSION ve APP_VERSION_CODE'u guncelle.
// APP_VERSION: kullaniciya gosterilir (semver)
// APP_VERSION_CODE: Android internal versionCode — her surumde +1 olmali
const APP_VERSION = "0.5.0";
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
    },
  },
};
