// APK size optimizations — gradle.properties + android/app/build.gradle
// 1. R8 minification (enableMinifyInReleaseBuilds)
// 2. Resource shrinking (enableShrinkResourcesInReleaseBuilds)
// 3. Locale stripping (resConfigs "en", "tr")
// 4. ML Kit barcode exclusion (expo-camera enableBarcodeScanner:false sadece iOS'ta etkili)
// 5. JVM heap 8G + metaspace 1G (R8 >512m metaspace ihtiyaci)
// Idempotent

const {
  withAppBuildGradle,
  withGradleProperties,
} = require("@expo/config-plugins");

// gradle.properties key/value upsert — PropertiesItem[] uzerinde
// Yeni anahtarlari yorumlariyla birlikte sona ekler, mevcutlari guncellenir
const upsertProperty = (props, key, value, comment) => {
  const existing = props.find((p) => p.type === "property" && p.key === key);
  if (existing) {
    existing.value = value;
    return;
  }
  if (comment) props.push({ type: "comment", value: ` ${comment}` });
  props.push({ type: "property", key, value });
};

const withGradleSize = (config) => {
  // [1] gradle.properties — R8/shrink flags + jvmargs + caching
  config = withGradleProperties(config, (config) => {
    const props = config.modResults;
    upsertProperty(
      props,
      "android.enableMinifyInReleaseBuilds",
      "true",
      "APK size — R8 minification",
    );
    upsertProperty(
      props,
      "android.enableShrinkResourcesInReleaseBuilds",
      "true",
      "APK size — resource shrinking (requires R8)",
    );
    upsertProperty(
      props,
      "org.gradle.jvmargs",
      "-Xmx8192m -XX:MaxMetaspaceSize=1024m",
      "R8 build heap + metaspace (R8 needs >512m metaspace)",
    );
    upsertProperty(props, "org.gradle.caching", "true");
    return config;
  });

  // [2] app/build.gradle — resConfigs + ML Kit excludes
  config = withAppBuildGradle(config, (config) => {
    let c = config.modResults.contents;

    // 2a. resConfigs — defaultConfig icine versionName'in altina
    // Regex `=` opsiyonel: withGradleSyntax LIFO'da bu plugin'den sonra calisabilir
    if (!/resConfigs\s/.test(c)) {
      c = c.replace(
        /(versionName\s*=?\s*"[^"]*")/,
        `$1\n\n        // APK size — sadece desteklenen lokalleri tut\n        resConfigs "en", "tr"`,
      );
    }

    // 2b. ML Kit barcode exclusion (native lib + modeller)
    if (!/libbarhopper_v3/.test(c)) {
      c = c.replace(
        /packagingOptions\s*\{\s*jniLibs\s*\{/,
        `packagingOptions {
        // APK size — kullanilmayan ML Kit barcode native lib + modelleri haric tut
        jniLibs {
            excludes += ["lib/*/libbarhopper_v3.so"]`,
      );
      if (!/resources\s*\{[^}]*mlkit_barcode/.test(c)) {
        c = c.replace(
          /(packagingOptions\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?\n\s*\})/,
          `$1
        resources {
            excludes += ["assets/mlkit_barcode_models/**"]
        }`,
        );
      }
    }

    config.modResults.contents = c;
    return config;
  });

  return config;
};

module.exports = withGradleSize;
