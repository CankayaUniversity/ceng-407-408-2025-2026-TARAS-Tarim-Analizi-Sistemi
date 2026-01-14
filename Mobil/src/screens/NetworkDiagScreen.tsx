// Ag tani ekrani - baglanti sorunlarini tespit eder
// Props: onBack, theme
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { NetworkDiagnostics } from "../utils/networkDiagnostics";
import { useLanguage } from "../context/LanguageContext";

interface NetworkDiagScreenProps {
  onBack: () => void;
  theme: any;
}

export default function NetworkDiagScreen({
  onBack,
  theme,
}: NetworkDiagScreenProps) {
  const { language, t } = useLanguage();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<string>("");
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setReport("Running diagnostics...\n");

    // Import API_HOST fresh each time to ensure we have current value
    const { API_HOST: currentHost } = await import("../utils/api");
    console.log("[NETDIAG] starting with host:", currentHost || "EMPTY");

    try {
      if (!currentHost) {
        setReport(
          "ERROR: API_HOST is not configured.\n\nCheck your .env file and rebuild the app.",
        );
        setIsRunning(false);
        return;
      }

      const diagnostics = new NetworkDiagnostics(currentHost);
      await diagnostics.runAll();
      const reportText = diagnostics.generateReport();
      setReport(reportText);
      setLastRun(new Date());
    } catch (error) {
      setReport(`Failed to run diagnostics: ${error}\n\n${report}`);
    } finally {
      setIsRunning(false);
    }
  };

  const shareReport = async () => {
    try {
      await Share.share({
        message: report,
        title: "Network Diagnostics Report",
      });
    } catch (error) {
      console.log("[NETDIAG] share err:", error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.textSecondary + "30",
          backgroundColor: theme.surface,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: 16 }}>
          <Text style={{ color: theme.accent, fontSize: 18 }}>
            ← {t.common.back}
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            color: theme.text,
            fontSize: 20,
            fontWeight: "bold",
            flex: 1,
          }}
        >
          {t.networkDiag.title}
        </Text>
      </View>

      {/* Aksiyon butonlari */}
      <View style={{ padding: 16, gap: 12 }}>
        <TouchableOpacity
          onPress={runDiagnostics}
          disabled={isRunning}
          style={{
            backgroundColor: isRunning
              ? theme.textSecondary + "50"
              : theme.accent,
            padding: 16,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          {isRunning ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                {t.networkDiag.running}
              </Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {t.networkDiag.startButton}
            </Text>
          )}
        </TouchableOpacity>

        {report && !isRunning && (
          <TouchableOpacity
            onPress={shareReport}
            style={{
              backgroundColor: theme.surface,
              padding: 16,
              borderRadius: 8,
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.textSecondary + "30",
            }}
          >
            <Text
              style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}
            >
              {t.networkDiag.shareReport}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bilgi kutusu */}
      <View style={{ padding: 16, paddingTop: 0 }}>
        <View
          style={{
            backgroundColor: theme.surface,
            padding: 12,
            borderRadius: 8,
            borderLeftWidth: 4,
            borderLeftColor: theme.accent,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>
            {t.networkDiag.infoHeader}
            {"\n"}• {t.networkDiag.bulletNetworkStatus}
            {"\n"}• {t.networkDiag.bulletDNS}
            {"\n"}• {t.networkDiag.bulletHTTP}
            {"\n"}• {t.networkDiag.bulletAPI}
            {"\n"}• {t.networkDiag.bulletSocketIO}
          </Text>
          {lastRun && (
            <Text
              style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}
            >
              {t.networkDiag.lastRun}:{" "}
              {lastRun.toLocaleTimeString(
                language === "tr" ? "tr-TR" : "en-US",
              )}
            </Text>
          )}
        </View>
      </View>

      {/* Rapor */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
      >
        {report ? (
          <View
            style={{
              backgroundColor: theme.surface,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.textSecondary + "30",
            }}
          >
            <Text
              style={{
                color: theme.text,
                fontSize: 12,
                fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                lineHeight: 18,
              }}
            >
              {report}
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 16,
                textAlign: "center",
              }}
            >
              {t.networkDiag.promptMessage}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Ipucu */}
      {!isRunning && (
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.textSecondary + "30",
            backgroundColor: theme.background,
          }}
        >
          <Text
            style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}
          >
            {t.networkDiag.tip}
          </Text>
        </View>
      )}
    </View>
  );
}
