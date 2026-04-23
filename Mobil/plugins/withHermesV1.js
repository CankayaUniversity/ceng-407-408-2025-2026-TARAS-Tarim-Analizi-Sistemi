// REMOVE-ON-SDK56 — tum dosya
// android/app/build.gradle — Hermes v1 from-source build fix'leri
// [1] hermesCommand → lazy Provider (hermesc.exe build-time race fix)
//     Property<String>.set(Provider<String>) — provider closure exec time'da calisir
//     (BundleHermesCTask.run() icindeki hermesCommand.get() cagrisinda).
//     Details: plans/plan-to-implement-b-streamed-knuth.md
// [2] createBundleReleaseJsAndAssets dependsOn :buildHermesC
//     Task ordering garantisi — Change 1 tek basina yarismaya ragmen duzgun sonuc vermez.
// Opts: useHermesV1 (bool, default false). app.config.js'den gecirilir.

const { withAppBuildGradle } = require("@expo/config-plugins");

const oldLine =
  /    hermesCommand = new File\(\["node", "--print", "require\.resolve\('hermes-compiler\/package\.json'.+?\)\.getParentFile\(\)\.getAbsolutePath\(\) \+ "\/hermesc\/%OS-BIN%\/hermesc"/;

const newLine = `    // hermesV1BuiltLazy — hermesc.exe varligi task-exec time'da kontrol edilir
    hermesCommand.set(project.providers.provider {
        def built = file("../../node_modules/react-native/ReactAndroid/hermes-engine/build/hermes/bin/hermesc.exe")
        if (built.exists()) { return built.absolutePath }
        return new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
    })`;

// react-native settings.gradle'da `includeBuild(expoAutolinking.reactNative)` ile dahil
// edilir; basename "react-native". Included build'in icindeki task'a referans icin
// gradle.includedBuild("name").task(":path") sentaksi sart — duz `:path` resolveOlmaz.
// (Empirik dogrulama: 2026-04-22 build, "Task with path ... not found in project ':app'".)
const taskDependencyBlock = `

// hermesV1TaskDependency — bundle task hermesc.exe build'ini bekler
afterEvaluate {
    tasks.matching { it.name == "createBundleReleaseJsAndAssets" }.configureEach {
        dependsOn(gradle.includedBuild("react-native").task(":packages:react-native:ReactAndroid:hermes-engine:buildHermesC"))
    }
}
`;

module.exports = (config, opts = {}) => {
  if (!opts.useHermesV1) return config;
  return withAppBuildGradle(config, (config) => {
    let c = config.modResults.contents;

    // [1] hermesCommand → lazy Provider
    if (!c.includes("hermesV1Built") && oldLine.test(c)) {
      c = c.replace(oldLine, newLine);
    }

    // [2] Task dependency (afterEvaluate)
    if (!c.includes("hermesV1TaskDependency")) {
      c += taskDependencyBlock;
    }

    config.modResults.contents = c;
    return config;
  });
};
