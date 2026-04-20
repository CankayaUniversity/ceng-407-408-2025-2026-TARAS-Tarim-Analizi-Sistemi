// APK size optimizations — gradle.properties + android/app/build.gradle yamasi
// 1. R8 minification (enableMinifyInReleaseBuilds)
// 2. Resource shrinking (enableShrinkResourcesInReleaseBuilds)
// 3. Locale stripping (resConfigs "en", "tr")
// 4. ML Kit barcode exclusion (kullanilmiyor, expo-camera plugin enableBarcodeScanner:false ile devre disi)
// Idempotent: yamali dosyalari yeniden yamalamaz
const fs = require("fs");

let totalChanges = 0;

// === 1. android/gradle.properties — R8 + shrink flags ===
const gp = "android/gradle.properties";
if (fs.existsSync(gp)) {
  let g = fs.readFileSync(gp, "utf8");
  let added = 0;

  if (!/^android\.enableMinifyInReleaseBuilds=/m.test(g)) {
    g += "\n# APK size — R8 minification\nandroid.enableMinifyInReleaseBuilds=true\n";
    added++;
  } else {
    g = g.replace(/^android\.enableMinifyInReleaseBuilds=.*/m, "android.enableMinifyInReleaseBuilds=true");
  }

  if (!/^android\.enableShrinkResourcesInReleaseBuilds=/m.test(g)) {
    g += "# APK size — resource shrinking (requires R8)\nandroid.enableShrinkResourcesInReleaseBuilds=true\n";
    added++;
  } else {
    g = g.replace(/^android\.enableShrinkResourcesInReleaseBuilds=.*/m, "android.enableShrinkResourcesInReleaseBuilds=true");
  }

  // R8 metaspace agir kullanir — heap 4G, metaspace 1G
  // Daemon out-of-metaspace hatasini onler
  const desiredJvmArgs = "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m";
  if (!/^org\.gradle\.jvmargs=/m.test(g)) {
    g += `\n# R8 build heap + metaspace (R8 needs >512m metaspace)\n${desiredJvmArgs}\n`;
    added++;
  } else if (!g.includes(desiredJvmArgs)) {
    g = g.replace(/^org\.gradle\.jvmargs=.*$/m, desiredJvmArgs);
    added++;
  }

  // Gradle cache
  if (!/^org\.gradle\.caching=true/m.test(g)) {
    g += "\norg.gradle.caching=true\n";
    added++;
  }

  if (added > 0) {
    fs.writeFileSync(gp, g);
    console.log(`  ${gp}: R8/shrink flags added (${added})`);
    totalChanges += added;
  }
}

// === 2. android/app/build.gradle — resConfigs + packagingOptions ===
const bg = "android/app/build.gradle";
if (fs.existsSync(bg)) {
  let c = fs.readFileSync(bg, "utf8");
  let fileChanges = 0;

  // 2a. resConfigs — defaultConfig icine ekle (sadece versionName satirinin altina)
  if (!/resConfigs\s/.test(c)) {
    c = c.replace(
      /(versionName\s*=\s*"[^"]*")/,
      `$1\n\n        // APK size — sadece desteklenen lokalleri tut\n        resConfigs "en", "tr"`,
    );
    fileChanges++;
  }

  // 2b. ML Kit barcode exclusion — packagingOptions blogunu zenginlestir
  // expo-camera plugin enableBarcodeScanner:false ayarli ama Android tarafinda native lib siyrilmiyor
  if (!/libbarhopper_v3/.test(c)) {
    c = c.replace(
      /packagingOptions\s*\{\s*jniLibs\s*\{/,
      `packagingOptions {
        // APK size — kullanilmayan ML Kit barcode native lib + modelleri haric tut
        jniLibs {
            excludes += ["lib/*/libbarhopper_v3.so"]`,
    );
    // resources excludes blogu da ekle (yoksa)
    if (!/resources\s*\{[^}]*mlkit_barcode/.test(c)) {
      c = c.replace(
        /(packagingOptions\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?\n\s*\})/,
        `$1
        resources {
            excludes += ["assets/mlkit_barcode_models/**"]
        }`,
      );
    }
    fileChanges++;
  }

  if (fileChanges > 0) {
    fs.writeFileSync(bg, c);
    console.log(`  ${bg}: ${fileChanges} optimizations added`);
    totalChanges += fileChanges;
  }
}

if (totalChanges === 0) {
  console.log("  Already optimized.");
}
