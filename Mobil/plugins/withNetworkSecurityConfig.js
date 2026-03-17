const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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

    // Get API host from environment variable
    const apiHost = process.env.API_HOST || "";
    // Extract domain/IP from URL (remove http:// and port)
    const domain =
      apiHost.replace(/^https?:\/\//, "").replace(/:\d+$/, "") || "localhost";

    // Write the network security config
    const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext (HTTP) traffic ONLY to the backend server -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">${domain}</domain>
    </domain-config>

    <!-- Block all other HTTP traffic (HTTPS only) -->
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
