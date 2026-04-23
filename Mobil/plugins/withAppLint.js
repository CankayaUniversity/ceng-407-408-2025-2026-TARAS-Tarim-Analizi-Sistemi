// android/app/build.gradle — lint abortOnError false + locale warning suppress
// Expo 'locales' config'i iOS permission stringlerini Android'e de yaziyor; default
// strings.xml'de olmadigi icin ExtraTranslation/MissingTranslation lint warning'leri
// build'i kiriyor.

const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = (config) => {
  return withAppBuildGradle(config, (config) => {
    let c = config.modResults.contents;
    if (c.includes("abortOnError false")) return config;
    // withGradleSyntax daha once calistiysa `=`, calismadiysa yoktur — her iki hal
    const ndkLineRe = /^(\s*)ndkVersion\s*=?\s*rootProject\.ext\.ndkVersion.*$/m;
    if (!ndkLineRe.test(c)) {
      console.warn("[withAppLint] ndkVersion line not found, skipping");
      return config;
    }
    config.modResults.contents = c.replace(
      ndkLineRe,
      (match, ws) =>
        `${match}\n\n${ws}lint {\n${ws}    abortOnError false\n${ws}    disable 'ExtraTranslation', 'MissingTranslation'\n${ws}}`,
    );
    return config;
  });
};
