// iOS-ozgu locale stringlerini Android default strings.xml'e ekler
// Expo 'locales' config'i iOS permission stringlerini Android values-b+xx/strings.xml'e de
// yaziyor, ancak default values/strings.xml'de olmadiklari icin 'ExtraTranslation' uyarisi olusuyor.
// Bu plugin varsayilan degerleri ekleyerek uyariyi susturuyor.
const { withStringsXml } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withDefaultLocaleStrings = (config) => {
  return withStringsXml(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const defaultLocalePath = path.join(projectRoot, "locales", "en.json");

    if (!fs.existsSync(defaultLocalePath)) return config;

    const localeData = JSON.parse(fs.readFileSync(defaultLocalePath, "utf8"));
    const resources = config.modResults.resources;

    // Mevcut string adlarini al
    const existingNames = new Set(
      (resources.string || []).map((s) => s.$.name),
    );

    // Default locale'den eksik olanlari ekle — xml2js XML kacislarini otomatik yapar
    for (const [key, value] of Object.entries(localeData)) {
      if (!existingNames.has(key)) {
        resources.string = resources.string || [];
        resources.string.push({
          $: { name: key },
          _: String(value),
        });
      }
    }

    return config;
  });
};

module.exports = withDefaultLocaleStrings;
