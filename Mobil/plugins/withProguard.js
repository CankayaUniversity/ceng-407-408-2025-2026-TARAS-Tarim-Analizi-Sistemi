// android/app/proguard-rules.pro — Expo Modules constructor reflection keep rules
// R8 minification Expo Modules'un KClass.constructors lookup'ini bozuyor
// (expo.modules.gl.GLView, CameraView vb.)
// Idempotency: sentinel marker kontrolu

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

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

module.exports = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const target = path.join(
        config.modRequest.projectRoot,
        "android/app/proguard-rules.pro",
      );
      if (!fs.existsSync(target)) return config;
      const current = fs.readFileSync(target, "utf8");
      if (current.includes(marker)) return config;
      fs.writeFileSync(target, current.trimEnd() + "\n" + block);
      return config;
    },
  ]);
};
