import "dotenv/config";

const useLocal = process.env.USE_LOCAL_API === "true";
const apiHost = useLocal
  ? process.env.API_HOST_LOCAL
  : process.env.API_HOST_AWS;

export default {
  expo: {
    name: "TarasMobil",
    slug: "tarasmobil",
    version: "1.0.0",
    assetBundlePatterns: ["**/*"],
    userInterfaceStyle: "automatic",
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow TarasMobil to access your camera.",
        },
      ],
      "./plugins/withNetworkSecurityConfig.js",
      ["react-native-ble-plx", { neverForBackground: true }],
    ],
    ios: {
      supportsTabletMode: true,
      bundleIdentifier: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
        NSBluetoothAlwaysUsageDescription: "TARAS needs Bluetooth to configure gateway devices.",
      },
    },
    android: {
      package: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      usesCleartextTraffic: true,
      navigationBarColor: "#0e1215",
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
