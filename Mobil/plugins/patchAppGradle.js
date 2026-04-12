// app/build.gradle yamalari:
// 1. hermesCommand → built hermesc.exe (Hermes v1)
// 2. lint abortOnError false (locale dosyalari)
const fs = require("fs");
const path = "android/app/build.gradle";

if (!fs.existsSync(path)) {
  console.log("  app/build.gradle not found.");
  process.exit();
}

let c = fs.readFileSync(path, "utf8");
let patched = false;

// [2] Lint abortOnError false
if (!c.includes("abortOnError false")) {
  c = c.replace(
    "android {\n    ndkVersion rootProject.ext.ndkVersion",
    `android {
    ndkVersion rootProject.ext.ndkVersion

    lint {
        abortOnError false
        disable 'ExtraTranslation', 'MissingTranslation'
    }`
  );
  patched = true;
  console.log("  lint patched.");
}

// [1] hermesCommand
if (c.includes("hermesV1Built")) {
  if (patched) fs.writeFileSync(path, c);
  console.log("  hermesCommand already patched.");
  process.exit();
}

// hermesCommand atamasini degistir — built hermesc varsa kullan
const oldLine = /    hermesCommand = new File\(\["node", "--print", "require\.resolve\('hermes-compiler\/package\.json'.+?\)\.getParentFile\(\)\.getAbsolutePath\(\) \+ "\/hermesc\/%OS-BIN%\/hermesc"/;

const newLine = `    def hermesV1Built = file("../../node_modules/react-native/ReactAndroid/hermes-engine/build/hermes/bin/hermesc.exe")
    if (hermesV1Built.exists()) {
        hermesCommand = hermesV1Built.absolutePath
    } else {
        hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
    }`;

if (oldLine.test(c)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync(path, c);
  console.log("  hermesCommand patched.");
} else {
  console.log("  hermesCommand pattern not found — check app/build.gradle.");
}
