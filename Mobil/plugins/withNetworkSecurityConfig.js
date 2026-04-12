const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin to add network security config for HTTP cleartext traffic
 * This allows the app to connect to the backend server specified in .env
 */
const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    // Add network security config reference to application tag
    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
    mainApplication.$["android:usesCleartextTraffic"] = "true";

    // Create the XML file
    const projectRoot = config.modRequest.projectRoot;
    const xmlDir = path.join(
      projectRoot,
      "android",
      "app",
      "src",
      "main",
      "res",
      "xml",
    );
    const xmlPath = path.join(xmlDir, "network_security_config.xml");

    // Ensure directory exists
    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
    }

    // Get API host from environment variable — .env dosyasinda tanimli olmali
    const useLocal = process.env.USE_LOCAL_API === "true";
    const apiHost = useLocal ? (process.env.API_HOST_LOCAL || "") : (process.env.API_HOST_AWS || "");
    // URL parse — protokol ve port temizle
    const isHttps = apiHost.startsWith("https://");
    const domain = apiHost.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    if (!domain) {
      throw new Error(
        "[withNetworkSecurityConfig] API_HOST_AWS or API_HOST_LOCAL must be set in .env"
      );
    }

    // HTTPS kullaniliyorsa cleartext istisnasi gerekmez — sadece TLS guvene
    // HTTP kullaniliyorsa (yerel dev) sadece o domain icin cleartext'e izin ver
    const networkSecurityConfig = isHttps
      ? `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`
      : `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">${domain}</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

    fs.writeFileSync(xmlPath, networkSecurityConfig, "utf-8");
    console.log("✅ Network security config created at:", xmlPath);

    return config;
  });
};

module.exports = withNetworkSecurityConfig;
