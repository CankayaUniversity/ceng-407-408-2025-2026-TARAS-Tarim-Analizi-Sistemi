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
import { s, vs, ms } from "../utils/responsive";

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
          padding: s(16),
          borderBottomWidth: 1,
          borderBottomColor: theme.textSecondary + "30",
          backgroundColor: theme.surface,
        }}
      >
        <TouchableOpacity onPress={onBack} style={{ marginRight: s(16) }}>
          <Text style={{ color: theme.accent, fontSize: ms(18, 0.3) }}>
            ← {t.common.back}
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            color: theme.text,
            fontSize: ms(20, 0.3),
            fontWeight: "bold",
            flex: 1,
          }}
        >
          {t.networkDiag.title}
        </Text>
      </View>

      {/* Aksiyon butonlari */}
      <View style={{ padding: s(16), gap: s(12) }}>
        <TouchableOpacity
          onPress={runDiagnostics}
          disabled={isRunning}
          style={{
            backgroundColor: isRunning
              ? theme.textSecondary + "50"
              : theme.accent,
            padding: s(16),
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          {isRunning ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
            >
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#fff", fontSize: ms(16, 0.3), fontWeight: "600" }}>
                {t.networkDiag.running}
              </Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontSize: ms(16, 0.3), fontWeight: "600" }}>
              {t.networkDiag.startButton}
            </Text>
          )}
        </TouchableOpacity>

        {report && !isRunning && (
          <TouchableOpacity
            onPress={shareReport}
            style={{
              backgroundColor: theme.surface,
              padding: s(16),
              borderRadius: 8,
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.textSecondary + "30",
            }}
          >
            <Text
              style={{ color: theme.accent, fontSize: ms(16, 0.3), fontWeight: "600" }}
            >
              {t.networkDiag.shareReport}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bilgi kutusu */}
      <View style={{ padding: s(16), paddingTop: 0 }}>
        <View
          style={{
            backgroundColor: theme.surface,
            padding: s(12),
            borderRadius: 8,
            borderLeftWidth: 4,
            borderLeftColor: theme.accent,
          }}
        >
          <Text style={{ color: theme.text, fontSize: ms(14, 0.3), lineHeight: ms(20, 0.3) }}>
            {t.networkDiag.infoHeader}
            {"\n"}• {t.networkDiag.bulletNetworkStatus}
            {"\n"}• {t.networkDiag.bulletDNS}
            {"\n"}• {t.networkDiag.bulletHTTP}
            {"\n"}• {t.networkDiag.bulletAPI}
            {"\n"}• {t.networkDiag.bulletSocketIO}
          </Text>
          {lastRun && (
            <Text
              style={{ color: theme.textSecondary, fontSize: ms(12, 0.3), marginTop: vs(8) }}
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
        contentContainerStyle={{ padding: s(16), paddingTop: 0 }}
      >
        {report ? (
          <View
            style={{
              backgroundColor: theme.surface,
              padding: s(12),
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.textSecondary + "30",
            }}
          >
            <Text
              style={{
                color: theme.text,
                fontSize: ms(12, 0.3),
                fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                lineHeight: ms(18, 0.3),
              }}
            >
              {report}
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: vs(40) }}>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: ms(16, 0.3),
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
            padding: s(16),
            borderTopWidth: 1,
            borderTopColor: theme.textSecondary + "30",
            backgroundColor: theme.background,
          }}
        >
          <Text
            style={{ color: theme.textSecondary, fontSize: ms(12, 0.3), lineHeight: ms(18, 0.3) }}
          >
            {t.networkDiag.tip}
          </Text>
        </View>
      )}
    </View>
  );
}
