// Gradle 9/10 Groovy DSL deprecation yamasi
// `propName value` → `propName = value` donusumu
// Sadece expo-generated dosyalar: android/build.gradle + android/app/build.gradle
// Idempotent: zaten = isareti olan satirlari atlar
const fs = require("fs");

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

const FILES = ["android/build.gradle", "android/app/build.gradle"];

let totalFixes = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, "utf8");
  let fileFixes = 0;

  for (const prop of PROPS) {
    // Satir basinda (whitespace OK), prop adi, en az bir bosluk, esit isareti DEGIL, herhangi bir karakter
    const re = new RegExp(`^(\\s*)${prop}\\s+(?!=)(\\S)`, "gm");
    content = content.replace(re, (_m, ws, ch) => {
      fileFixes++;
      return `${ws}${prop} = ${ch}`;
    });
  }

  // maven { url 'foo' } pattern — kapali blok icinde
  content = content.replace(
    /(maven\s*\{\s*url)\s+(?!=)(['"])/g,
    (_m, head, q) => {
      fileFixes++;
      return `${head} = ${q}`;
    },
  );

  if (fileFixes > 0) {
    fs.writeFileSync(file, content);
    console.log(`  ${file}: ${fileFixes} fixes`);
    totalFixes += fileFixes;
  }
}

if (totalFixes === 0) {
  console.log("  Already patched.");
}
