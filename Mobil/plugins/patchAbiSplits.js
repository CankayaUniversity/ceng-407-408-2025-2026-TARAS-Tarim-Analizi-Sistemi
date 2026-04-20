// android/app/build.gradle — ABI splits blogu enjekte
// Gradle property -PabiSplitsEnabled=true ile aktiflesir, default disabled
// Split mode = 4 ayri APK (arm64-v8a, armeabi-v7a, x86, x86_64), universalApk yok
const fs = require("fs");
const bg = "android/app/build.gradle";

if (!fs.existsSync(bg)) {
  console.log("  no android/app/build.gradle");
  process.exit(0);
}

let c = fs.readFileSync(bg, "utf8");

if (/splits\s*\{\s*\r?\n\s*abi\s*\{/.test(c)) {
  console.log("  splits.abi: already patched");
  process.exit(0);
}

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

if (/^\s*buildTypes\s*\{/m.test(c)) {
  c = c.replace(/(\r?\n\s*buildTypes\s*\{)/, splitsBlock + "$1");
  fs.writeFileSync(bg, c);
  console.log("  splits.abi block injected before buildTypes");
} else {
  console.log("  WARN: buildTypes block not found, splits.abi skipped");
  process.exit(1);
}
