// android/app/proguard-rules.pro yamasi — R8 minify Expo Modules constructor reflection bozar
// Hata: java.lang.IllegalStateException: Didn't find a correct constructor for class l7.e
//   (l7.e = expo.modules.gl.GLView, R8 obfuscation)
// Idempotent: yamali dosyayi tekrar yamalamaz
const fs = require("fs");

const targetFile = "android/app/proguard-rules.pro";
const marker = "# Expo Modules — Kotlin reflection on view-manager constructors";
const block = `
# Expo Modules — Kotlin reflection on view-manager constructors (R8 obfuscation breaks KClass.constructors lookup)
-keep class expo.modules.** { *; }
-keepclassmembers class expo.modules.** { <init>(...); }
-keep @kotlin.Metadata class expo.modules.**
-keep class kotlin.Metadata { *; }
-keepattributes RuntimeVisible*Annotations,Signature,InnerClasses,EnclosingMethod,*Annotation*
-dontwarn expo.modules.**
`;

if (!fs.existsSync(targetFile)) {
  console.log(`  ${targetFile}: not found (skip)`);
  process.exit(0);
}

const current = fs.readFileSync(targetFile, "utf8");
if (current.includes(marker)) {
  console.log("  proguard-rules.pro: already patched");
  process.exit(0);
}

fs.writeFileSync(targetFile, current.trimEnd() + "\n" + block);
console.log("  proguard-rules.pro: Expo Modules keep rules added");
