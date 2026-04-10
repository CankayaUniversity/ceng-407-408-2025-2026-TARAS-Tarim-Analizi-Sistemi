// Sensor node ekleme akisi - gateway uzerinden eslestirme
// Adimlar: gateway sec -> bolge sec -> eslestirme -> tamam

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Theme } from "../../types";
import { useLanguage } from "../../context/LanguageContext";
import { gatewayAPI, sensorAPI, socketAPI } from "../../utils/api";

type Step = "gatewaySelect" | "zoneSelect" | "pairing" | "done";

interface GatewayItem {
  gateway_id: string;
  name: string;
  mac: string;
  is_online: boolean;
  sensor_count: number;
  firmware_version: string | null;
  farm_id: string;
}

interface ZoneItem {
  zone_id: string;
  zone_name: string;
  field_name: string;
  farm_name: string;
}

interface DiscoveredNode {
  mac: string;
  sensor_caps?: number; // bitmask: 1=SHT31, 2=soil
}

interface AddSensorNodeFlowProps {
  theme: Theme;
  onComplete: () => void;
  onBack: () => void;
}

export const AddSensorNodeFlow = ({
  theme,
  onComplete,
  onBack,
}: AddSensorNodeFlowProps) => {
  const { t } = useLanguage();

  // Adim durumu
  const [step, setStep] = useState<Step>("gatewaySelect");
  const [error, setError] = useState<string | null>(null);

  // Adim 1: Gateway secimi
  const [gateways, setGateways] = useState<GatewayItem[]>([]);
  const [isLoadingGateways, setIsLoadingGateways] = useState(true);
  const [latestFwVersion, setLatestFwVersion] = useState<string | null>(null);
  const [updatingGatewayId, setUpdatingGatewayId] = useState<string | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GatewayItem | null>(
    null,
  );

  // Adim 2: Bolge secimi
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneItem | null>(null);

  // Adim 3: Eslestirme
  const [_isPairingActive, setIsPairingActive] = useState(false);
  const [discoveredNode, setDiscoveredNode] = useState<DiscoveredNode | null>(
    null,
  );
  const [_isPaired, setIsPaired] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [pairingTimeLeft, setPairingTimeLeft] = useState(30);
  const [approvalTimeLeft, setApprovalTimeLeft] = useState(20);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const approvalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Gateway listesini cek
  useEffect(() => {
    const fetchGateways = async (): Promise<void> => {
      try {
        setIsLoadingGateways(true);
        const result = await gatewayAPI.getGateways();
        if (result.success && result.data) {
          setGateways(result.data);
          console.log("[HW] gateway'ler:", result.data.length);
        } else {
          setError(result.error || t.common.error);
        }
      } catch (err) {
        console.log("[HW] gateway cekme hatasi:", err);
        setError(t.common.error);
      } finally {
        setIsLoadingGateways(false);
      }
    };
    fetchGateways();
    // Son firmware versiyonunu cek
    gatewayAPI.getLatestFirmware().then((res) => {
      if (res.success && res.data) setLatestFwVersion(res.data.version);
    }).catch(() => {});
  }, [t]);

  // Temizlik - socket dinleyicileri ve timer
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Gateway firmware guncelle
  const handleOtaUpdate = useCallback(async (gw: GatewayItem): Promise<void> => {
    Alert.alert(
      t.hardware.updateConfirmTitle,
      t.hardware.updateConfirmMessage.replace("{version}", latestFwVersion || ""),
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.common.ok,
          onPress: async () => {
            setUpdatingGatewayId(gw.gateway_id);
            try {
              const res = await gatewayAPI.triggerOta(gw.gateway_id);
              if (res.success) {
                Alert.alert(t.hardware.updateSuccess);
              } else {
                Alert.alert(t.hardware.updateFailed, res.error);
              }
            } catch {
              Alert.alert(t.hardware.updateFailed);
            } finally {
              setUpdatingGatewayId(null);
            }
          },
        },
      ],
    );
  }, [t, latestFwVersion]);

  // Gateway sec ve bolge secime gec
  const handleGatewaySelect = useCallback(
    (gw: GatewayItem): void => {
      if (!gw.is_online) return;
      setSelectedGateway(gw);
      setError(null);
      setStep("zoneSelect");
    },
    [],
  );

  // Bolge listesini cek
  useEffect(() => {
    if (step !== "zoneSelect") return;

    const fetchZones = async (): Promise<void> => {
      try {
        setIsLoadingZones(true);
        const result = await sensorAPI.getUserZones();
        if (result.success && result.data?.zones) {
          setZones(result.data.zones);
          console.log("[HW] bolgeler:", result.data.zones.length);
        } else {
          setError(result.error || t.common.error);
        }
      } catch (err) {
        console.log("[HW] bolge cekme hatasi:", err);
        setError(t.common.error);
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZones();
  }, [step, t]);

  // Bolge sec ve eslestirmeyi baslat
  const handleZoneSelect = useCallback(
    (zone: ZoneItem): void => {
      setSelectedZone(zone);
      setError(null);
      setStep("pairing");
    },
    [],
  );

  // Eslestirme baslatma
  useEffect(() => {
    if (step !== "pairing" || !selectedGateway || !selectedZone) return;

    const gwId = selectedGateway.gateway_id;

    const startPairing = async (): Promise<void> => {
      try {
        setIsPairingActive(true);
        setDiscoveredNode(null);
        setIsPaired(false);
        setPairingTimeLeft(20);
        setApprovalTimeLeft(15);

        console.log("[HW] eslestirme baslatiliyor:", gwId);

        // Gateway'in guncel durumunu kontrol et
        const freshList = await gatewayAPI.getGateways();
        const freshGw = freshList.data?.find((g: { gateway_id: string }) => g.gateway_id === gwId);
        if (!freshGw?.is_online) {
          setError(t.hardware.gatewayOffline);
          setIsPairingActive(false);
          return;
        }

        const result = await gatewayAPI.startPairing(gwId, 30); // 30s gateway timeout (> 20s app search + WiFi reconnect buffer)
        if (!result.success) throw new Error(result.error || "Pairing start failed");

        // 30s arama geri sayimi
        timerRef.current = setInterval(() => {
          setPairingTimeLeft((prev) => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
              setIsPairingActive(false);
              setStep("zoneSelect"); // geri don
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Socket baglan ve farm room'una abone ol
        await socketAPI.connect();
        const sock = socketAPI.getSocket();
        if (!sock) {
          setError(t.hardware.connectionLost);
          setIsPairingActive(false);
          return;
        }
        if (selectedGateway.farm_id) {
          sock.emit("subscribe", { farmId: selectedGateway.farm_id });
          console.log("[HW] farm room'una abone olundu:", selectedGateway.farm_id);
        }

        // Socket dinle
        const cleanup = socketAPI.onPairingEvents({
          onNodeDiscovered: (data: DiscoveredNode) => {
            console.log("[HW] node kesfedildi:", data.mac);
            setDiscoveredNode(data);
            // Arama timer'ini durdur, 20s onay timer'ini baslat
            if (timerRef.current) clearInterval(timerRef.current);
            setApprovalTimeLeft(15);
            approvalTimerRef.current = setInterval(() => {
              setApprovalTimeLeft((prev) => {
                if (prev <= 1) {
                  if (approvalTimerRef.current) clearInterval(approvalTimerRef.current);
                  // Otomatik reddet
                  console.log("[HW] otomatik red (20s)");
                  gatewayAPI.rejectNode(gwId, data.mac, "auto_timeout").catch(() => {});
                  if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
                  setDiscoveredNode(null);
                  setIsPairingActive(false);
                  setStep("zoneSelect"); // geri don
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          },
          onPairComplete: () => {
            console.log("[HW] eslestirme tamamlandi");
            setIsPaired(true);
            setIsPairingActive(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (approvalTimerRef.current) clearInterval(approvalTimerRef.current);
            setStep("done");
          },
        });
        cleanupRef.current = cleanup;
      } catch (err) {
        console.log("[HW] eslestirme hatasi:", err instanceof Error ? err.message : err);
        setError(err instanceof Error ? err.message : t.hardware.connectionLost);
        setIsPairingActive(false);
      }
    };

    startPairing();

    return () => {
      // Temizlik — sadece timer ve socket dinleyicilerini temizle
      // stopPairing sadece decline/cancel'da cagirilir, useEffect cleanup'ta degil
      if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (approvalTimerRef.current) { clearInterval(approvalTimerRef.current); approvalTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedGateway?.gateway_id, selectedZone?.zone_id]);

  // Kesfedilen node'u onayla
  const handleApproveNode = useCallback(async (): Promise<void> => {
    if (!selectedGateway || !selectedZone || !discoveredNode || isApproving) return;
    if (approvalTimerRef.current) clearInterval(approvalTimerRef.current);
    setIsApproving(true);

    try {
      setError(null);
      console.log("[HW] node onaylaniyor:", discoveredNode.mac);

      const result = await gatewayAPI.approveNode(
        selectedGateway.gateway_id,
        discoveredNode.mac,
        selectedZone.zone_id,
      );

      if (!result.success) {
        throw new Error(result.error || "Approve failed");
      }

      // pair_complete eventi bekleniyor, socket dinleyicisi halledecek
      console.log("[HW] onay gonderildi, bekleniyor");
    } catch (err) {
      console.log(
        "[HW] onay hatasi:",
        err instanceof Error ? err.message : err,
      );
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsApproving(false);
    }
  }, [selectedGateway, selectedZone, discoveredNode, isApproving, t]);

  // Kesfedilen node'u reddet
  const handleDeclineNode = useCallback(async (): Promise<void> => {
    if (!selectedGateway || !discoveredNode) return;
    if (approvalTimerRef.current) clearInterval(approvalTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    console.log("[HW] node reddediliyor:", discoveredNode.mac);
    await gatewayAPI.rejectNode(selectedGateway.gateway_id, discoveredNode.mac, "user_declined").catch(() => {});
    setDiscoveredNode(null);
    setIsPairingActive(false);
    setStep("zoneSelect"); // geri don, kullanici tekrar baslayabilir
  }, [selectedGateway, discoveredNode]);

  // Eslestirmeyi yeniden dene
  const handleRetryPairing = useCallback((): void => {
    setError(null);
    setDiscoveredNode(null);
    setIsPaired(false);
    // step'i tekrar set edince useEffect tetiklenir
    setStep("zoneSelect");
    setTimeout(() => setStep("pairing"), 100);
  }, []);

  // Geri adim
  const handleStepBack = useCallback((): void => {
    setError(null);
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    switch (step) {
      case "zoneSelect":
        setStep("gatewaySelect");
        break;
      case "pairing":
        setIsPairingActive(false);
        setStep("zoneSelect");
        break;
      default:
        onBack();
    }
  }, [step, onBack]);

  // Zaman formatlama (120 -> "2:00")
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Gateway secim ekrani
  const renderGatewaySelect = (): React.JSX.Element => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t.hardware.selectGateway}
      </Text>

      {isLoadingGateways ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={gateways}
          keyExtractor={(item) => item.gateway_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.listItem,
                {
                  backgroundColor: theme.surface,
                  opacity: item.is_online ? 1 : 0.5,
                },
              ]}
              onPress={() => handleGatewaySelect(item)}
              activeOpacity={item.is_online ? 0.7 : 1}
              disabled={!item.is_online}
            >
              <MaterialCommunityIcons
                name="access-point"
                size={24}
                color={item.is_online ? theme.accent : theme.textSecondary}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.listItemTitle, { color: theme.text }]}
                >
                  {item.name || item.mac}
                </Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: item.is_online
                          ? "#22c55e"
                          : "#ef4444",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.listItemSub,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.is_online
                      ? t.hardware.online
                      : t.hardware.offline}
                    {" - "}
                    {item.sensor_count} {t.hardware.sensors}
                  </Text>
                </View>
              </View>
              {item.is_online && latestFwVersion && item.firmware_version !== latestFwVersion ? (
                updatingGatewayId === item.gateway_id ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <TouchableOpacity
                    style={{ backgroundColor: theme.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                    onPress={(e) => { e.stopPropagation(); handleOtaUpdate(item); }}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>
                      {t.hardware.updateAvailable}
                    </Text>
                  </TouchableOpacity>
                )
              ) : item.is_online ? (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={theme.textSecondary}
                />
              ) : (
                <Text
                  style={[
                    styles.offlineLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {t.hardware.gatewayOffline}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              {t.hardware.noGatewaysFound}
            </Text>
          }
        />
      )}
    </View>
  );

  // Bolge secim ekrani
  const renderZoneSelect = (): React.JSX.Element => {
    // Bolgeleri tarla adina gore grupla
    const grouped: Record<string, ZoneItem[]> = {};
    zones.forEach((z) => {
      const key = z.field_name || z.farm_name;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(z);
    });

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          {t.hardware.selectZone}
        </Text>

        {isLoadingZones ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : (
          <FlatList
            data={Object.entries(grouped)}
            keyExtractor={([key]) => key}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: [fieldName, fieldZones] }) => (
              <View>
                <Text
                  style={[
                    styles.groupHeader,
                    { color: theme.textSecondary },
                  ]}
                >
                  {fieldName}
                </Text>
                {fieldZones.map((zone) => (
                  <TouchableOpacity
                    key={zone.zone_id}
                    style={[
                      styles.listItem,
                      { backgroundColor: theme.surface, marginBottom: 8 },
                    ]}
                    onPress={() => handleZoneSelect(zone)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-radius"
                      size={24}
                      color={theme.accent}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.listItemTitle,
                          { color: theme.text },
                        ]}
                      >
                        {zone.zone_name}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            ListEmptyComponent={
              <Text
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                {t.hardware.noZonesFound}
              </Text>
            }
          />
        )}
      </View>
    );
  };

  // Eslestirme ekrani
  const renderPairing = (): React.JSX.Element => (
    <View style={styles.stepContainer}>
      {!discoveredNode ? (
        // Bekleme durumu
        <View style={styles.centerWrap}>
          <ActivityIndicator
            size="large"
            color={theme.accent}
            style={{ marginBottom: 24 }}
          />
          <Text style={[styles.pairingTitle, { color: theme.text }]}>
            {t.hardware.searchingNodes}
          </Text>
          <Text
            style={[
              styles.pairingSubtext,
              { color: theme.textSecondary },
            ]}
          >
            {t.hardware.powerOnSensor}
          </Text>
          <Text style={[styles.timerText, { color: theme.accent }]}>
            {formatTime(pairingTimeLeft)}
          </Text>

          {/* Zaman doldu */}
          {pairingTimeLeft === 0 && (
            <TouchableOpacity
              style={[
                styles.retryButton,
                { backgroundColor: theme.accent },
              ]}
              onPress={handleRetryPairing}
            >
              <Text style={styles.retryButtonText}>
                {t.hardware.retry}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // Node kesfedildi — onay/red ekrani
        <View style={styles.centerWrap}>
          <View
            style={[
              styles.discoveredCard,
              { backgroundColor: theme.surface },
            ]}
          >
            <MaterialCommunityIcons
              name="thermometer-lines"
              size={40}
              color={theme.accent}
              style={{ marginBottom: 12 }}
            />
            <Text style={[styles.nodeFoundTitle, { color: theme.text }]}>
              {t.hardware.nodeFound}
            </Text>
            <Text
              style={[styles.nodeMac, { color: theme.textSecondary }]}
            >
              MAC: {discoveredNode.mac}
            </Text>

            {/* 20s geri sayim */}
            <Text style={[styles.timerText, { color: approvalTimeLeft <= 5 ? "#ef4444" : theme.accent, marginTop: 12 }]}>
              {approvalTimeLeft}s
            </Text>
            <Text style={[styles.pairingSubtext, { color: theme.textSecondary, fontSize: 12 }]}>
              {t.hardware.autoRejectNotice}: {approvalTimeLeft}s
            </Text>
          </View>

          {/* Approve / Decline buttons */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#22c55e", flex: 1, opacity: isApproving ? 0.5 : 1 }]}
              onPress={handleApproveNode}
              activeOpacity={0.7}
              disabled={isApproving}
            >
              {isApproving ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
              ) : (
                <MaterialCommunityIcons name="check" size={20} color="#fff" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.primaryBtnText}>{t.hardware.approve}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#ef4444", flex: 1 }]}
              onPress={handleDeclineNode}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>{t.hardware.decline}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // Basari ekrani
  const renderDone = (): React.JSX.Element => (
    <View style={[styles.stepContainer, styles.centerWrap]}>
      <View
        style={[
          styles.successIcon,
          { backgroundColor: theme.accent + "20" },
        ]}
      >
        <MaterialCommunityIcons
          name="check-circle"
          size={64}
          color={theme.accent}
        />
      </View>
      <Text style={[styles.doneTitle, { color: theme.text }]}>
        {t.hardware.nodePaired}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
        onPress={onComplete}
        activeOpacity={0.7}
      >
        <Text style={styles.primaryBtnText}>{t.hardware.done}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.flowContainer}>
      {/* Hata mesaji */}
      {error && (
        <View style={[styles.errorBar, { backgroundColor: "#ef4444" + "20" }]}>
          <MaterialCommunityIcons
            name="alert-circle"
            size={18}
            color="#ef4444"
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>
            {error}
          </Text>
        </View>
      )}

      {/* Adim icerik */}
      {step === "gatewaySelect" && renderGatewaySelect()}
      {step === "zoneSelect" && renderZoneSelect()}
      {step === "pairing" && renderPairing()}
      {step === "done" && renderDone()}

      {/* Geri butonu (eslestirme ve tamam disinda) */}
      {step !== "pairing" && step !== "done" && step !== "gatewaySelect" && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleStepBack}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={18}
            color={theme.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
            {t.common.back}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  flowContainer: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  listItemSub: {
    fontSize: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  offlineLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  groupHeader: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  pairingTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  pairingSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  timerText: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 24,
  },
  discoveredCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    width: "100%",
    marginBottom: 16,
  },
  nodeFoundTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  nodeMac: {
    fontSize: 13,
    fontFamily: "monospace",
    marginBottom: 4,
  },
  nodeCaps: {
    fontSize: 12,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
