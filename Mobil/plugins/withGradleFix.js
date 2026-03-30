/**
 * Expo config plugin: Gradle 10 uyumlulugu icin build.gradle dosyalarini yamalar
 * "propName value" sozdizimini "propName = value" ile degistirir
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withGradleFix = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // --- android/build.gradle ---
      const rootGradle = path.join(projectRoot, "android", "build.gradle");
      if (fs.existsSync(rootGradle)) {
        let content = fs.readFileSync(rootGradle, "utf-8");
        // maven { url 'https://...' } -> maven { url = 'https://...' }
        content = content.replace(
          /maven\s*\{\s*url\s+(['"])/g,
          "maven { url = $1"
        );
        fs.writeFileSync(rootGradle, content, "utf-8");
      }

      // --- android/app/build.gradle ---
      const appGradle = path.join(projectRoot, "android", "app", "build.gradle");
      if (fs.existsSync(appGradle)) {
        let content = fs.readFileSync(appGradle, "utf-8");

        // Fix space-assignment patterns in android { } block
        const fixes = [
          // ndkVersion rootProject.ext.ndkVersion -> ndkVersion = rootProject.ext.ndkVersion
          [/ndkVersion\s+(rootProject)/g, "ndkVersion = $1"],
          [/buildToolsVersion\s+(rootProject)/g, "buildToolsVersion = $1"],
          [/compileSdk\s+(rootProject)/g, "compileSdk = $1"],
          [/namespace\s+'/g, "namespace = '"],
          // signingConfig signingConfigs.debug -> signingConfig = signingConfigs.debug
          [/signingConfig\s+(signingConfigs)/g, "signingConfig = $1"],
          // shrinkResources enableShrinkResources -> shrinkResources = enableShrinkResources
          [/shrinkResources\s+(enableShrink)/g, "shrinkResources = $1"],
          // crunchPngs enablePngCrunch -> crunchPngs = enablePngCrunch
          [/crunchPngs\s+(enablePng)/g, "crunchPngs = $1"],
          // useLegacyPackaging enableLegacy -> useLegacyPackaging = enableLegacy
          [/useLegacyPackaging\s+(enableLegacy)/g, "useLegacyPackaging = $1"],
          // ignoreAssetsPattern '!.svn... -> ignoreAssetsPattern = '!.svn...
          [/ignoreAssetsPattern\s+'/g, "ignoreAssetsPattern = '"],
        ];

        for (const [pattern, replacement] of fixes) {
          content = content.replace(pattern, replacement);
        }

        fs.writeFileSync(appGradle, content, "utf-8");
      }

      console.log("✅ Gradle syntax fixed for Gradle 10 compatibility");
      return config;
    },
  ]);
};

module.exports = withGradleFix;
