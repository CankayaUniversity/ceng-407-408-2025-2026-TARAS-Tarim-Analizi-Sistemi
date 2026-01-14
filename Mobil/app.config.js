import "dotenv/config";

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
    ],
    ios: {
      supportsTabletMode: true,
      bundleIdentifier: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      package: "com.tarasmobil.app",
      userInterfaceStyle: "automatic",
      usesCleartextTraffic: true,
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE"],
    },
    extra: {
      apiHost: process.env.API_HOST,
      demoUsername: process.env.DEMO_USERNAME,
      demoPassword: process.env.DEMO_PASSWORD,
      awsDemoUsername: process.env.AWS_DEMO_USERNAME,
      awsDemoPassword: process.env.AWS_DEMO_PASSWORD,
    },
  },
};
