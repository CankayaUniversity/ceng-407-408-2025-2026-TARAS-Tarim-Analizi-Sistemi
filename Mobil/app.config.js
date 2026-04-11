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
  ["react-native-ble-plx", { neverForBackground: true }],
  [
    "expo-build-properties",
    {
      buildReactNativeFromSource: useHermesV1,
      useHermesV1,
    },
  ],
];

module.exports = {
  expo: {
    name: "TarasMobil",
    slug: "tarasmobil",
    version: "1.0.0",
    assetBundlePatterns: ["**/*"],
    userInterfaceStyle: "automatic",
    plugins,
    locales: {
      tr: "./locales/tr.json",
      en: "./locales/en.json",
    },
    ios: {
      supportsTabletMode: true,
      bundleIdentifier: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      package: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      usesCleartextTraffic: true,
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
