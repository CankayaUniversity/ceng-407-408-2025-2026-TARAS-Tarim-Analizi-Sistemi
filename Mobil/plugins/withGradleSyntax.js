// Gradle 9/10 Groovy DSL deprecation yamasi
// `propName value` → `propName = value` donusumu
// Hem android/build.gradle hem android/app/build.gradle
// Idempotent: zaten = isareti olan satirlari atlar

const {
  withAppBuildGradle,
  withProjectBuildGradle,
} = require("@expo/config-plugins");

// AGP property assignment olan deprecated isimler
// proguardFiles, signingConfigs gibi method/block isimleri YOK
const PROPS = [
  "namespace",
  "compileSdk", "compileSdkVersion", "buildToolsVersion", "ndkVersion",
  "minSdkVersion", "targetSdkVersion",
  "applicationId", "versionCode", "versionName",
  "minifyEnabled", "shrinkResources", "crunchPngs", "useLegacyPackaging",
  "signingConfig", "ignoreAssetsPattern", "abortOnError",
  "storeFile", "storePassword", "keyAlias", "keyPassword",
];

const transform = (content) => {
  for (const prop of PROPS) {
    const re = new RegExp(`^(\\s*)${prop}\\s+(?!=)(\\S)`, "gm");
    content = content.replace(re, (_m, ws, ch) => `${ws}${prop} = ${ch}`);
  }
  // maven { url 'foo' } — kapali blok icinde
  content = content.replace(
    /(maven\s*\{\s*url)\s+(?!=)(['"])/g,
    (_m, head, q) => `${head} = ${q}`,
  );
  return content;
};

module.exports = (config) => {
  config = withProjectBuildGradle(config, (config) => {
    config.modResults.contents = transform(config.modResults.contents);
    return config;
  });
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = transform(config.modResults.contents);
    return config;
  });
  return config;
};
