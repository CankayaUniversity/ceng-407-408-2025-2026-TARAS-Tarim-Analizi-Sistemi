module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // vision-camera'nin frame processor worklet'leri icin
      "react-native-worklets-core/plugin",
    ],
  };
};
