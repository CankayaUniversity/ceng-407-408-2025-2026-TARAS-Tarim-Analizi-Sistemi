// android/app/build.gradle — ABI splits blogu
// Gradle property -PabiSplitsEnabled=true ile aktiflesir, default disabled
// Split mode = 4 ayri APK (arm64-v8a, armeabi-v7a, x86, x86_64), universalApk yok

const { withAppBuildGradle } = require("@expo/config-plugins");

const splitsBlock = `
    // APK size — per-ABI split APKs (aktif: -PabiSplitsEnabled=true)
    splits {
        abi {
            enable project.hasProperty('abiSplitsEnabled') && project.abiSplitsEnabled.toBoolean()
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86", "x86_64"
            universalApk false
        }
    }
`;

module.exports = (config) => {
  return withAppBuildGradle(config, (config) => {
    let c = config.modResults.contents;
    if (/splits\s*\{\s*\r?\n\s*abi\s*\{/.test(c)) return config;
    if (!/^\s*buildTypes\s*\{/m.test(c)) {
      console.warn("[withAbiSplits] buildTypes block not found, skipping");
      return config;
    }
    config.modResults.contents = c.replace(
      /(\r?\n\s*buildTypes\s*\{)/,
      splitsBlock + "$1",
    );
    return config;
  });
};
