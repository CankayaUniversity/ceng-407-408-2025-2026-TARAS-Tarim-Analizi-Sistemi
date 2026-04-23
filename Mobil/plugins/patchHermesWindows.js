// REMOVE-ON-SDK56 — tum dosya. SDK 56'da Hermes v1 default + prebuilt Windows binary shiplenir.
// Hermes kaynak derlemesi Windows uyumluluk — Gradle dosyasi yamalari
// Calisma zamani: npm postinstall (patch-package'den sonra). Manuel cagirilmaz.
const fs = require("fs");

// Sadece Windows + Hermes v1 ON kombinasyonunda calis. Diger her durumda no-op.
// CI'de (Linux/Mac) postinstall fail etmemeli.
if (process.platform !== "win32") process.exit(0);
const useHermesV1 = (() => {
  try {
    const env = fs.readFileSync(".env", "utf8");
    const m = env.match(/^USE_HERMES_V1\s*=\s*(.+)$/m);
    return !!(m && m[1].trim().toLowerCase() === "true");
  } catch { return false; }
})();
if (!useHermesV1) process.exit(0);

const gradlePath = "node_modules/react-native/ReactAndroid/hermes-engine/build.gradle.kts";
if (!fs.existsSync(gradlePath)) {
  console.log("  Hermes build.gradle.kts not found.");
  process.exit();
}

let g = fs.readFileSync(gradlePath, "utf8");
let patched = false;

// [1] Windows path fix — hem host build hem Android build icin
if (!g.includes('.replace("\\\\", "/")')) {
  g = g.replace(/jsiDir\.absolutePath(?!\.replace)/g, 'jsiDir.absolutePath.replace("\\\\", "/")');
  g = g.replace(/hermesBuildDir\.toString\(\)(?!\.replace)/g, 'hermesBuildDir.toString().replace("\\\\", "/")');
  // Android build: "-DJSI_DIR=${jsiDir}" → forward slashes
  g = g.replace('"-DJSI_DIR=${jsiDir}"', '"-DJSI_DIR=${jsiDir.absolutePath.replace("\\\\", "/")}"');
  // Android build: ImportHostCompilers path
  g = g.replace(
    '"-DIMPORT_HOST_COMPILERS=${File(hermesBuildDir, "ImportHostCompilers.cmake").toString()}"',
    '"-DIMPORT_HOST_COMPILERS=${File(hermesBuildDir, "ImportHostCompilers.cmake").toString().replace("\\\\", "/")}"'
  );
  patched = true;
  console.log("  [1] Path fix (host + Android).");
}

// [2] Boost Context disabled via CMake arg
if (!g.includes("HERMES_ALLOW_BOOST_CONTEXT")) {
  g = g.replace('"-DCMAKE_BUILD_TYPE=Release",', '"-DCMAKE_BUILD_TYPE=Release",\n              "-DHERMES_ALLOW_BOOST_CONTEXT=0",');
  patched = true;
  console.log("  [2] Boost disabled.");
}

// [3] NMake → Ninja
if (g.includes('"-GNMake Makefiles"')) {
  g = g.replace('"-GNMake Makefiles"', '"-GNinja"');
  patched = true;
  console.log("  [3] Ninja generator.");
}

// [4] Post-unzip Node script task — MSVC patches
if (!g.includes("patchHermesForWindows")) {
  const patchTask = `
// Windows MSVC uyumluluk — unzip sonrasi Node script ile yamala
val patchHermesForWindows by tasks.registering(Exec::class) {
    dependsOn(unzipHermes)
    // hermesDir'den 4 ust dizin: sdks/hermes → sdks → react-native → node_modules → Mobil
    val mobilDir = hermesDir.parentFile.parentFile.parentFile.parentFile
    val scriptPath = File(mobilDir, "plugins/patchHermesSources.js").absolutePath.replace("\\\\", "/")
    commandLine("node", scriptPath, hermesDir.absolutePath.replace("\\\\", "/"))
}

`;
  g = g.replace("val configureBuildForHermes by", patchTask + "val configureBuildForHermes by");
  g = g.replace(
    "dependsOn(installCMake)\n      workingDir(hermesDir)",
    "dependsOn(installCMake)\n      dependsOn(patchHermesForWindows)\n      workingDir(hermesDir)"
  );
  patched = true;
  console.log("  [4] Post-unzip Node task.");
}

if (patched) fs.writeFileSync(gradlePath, g);
console.log("  Done.");
