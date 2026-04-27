// Sensor node ekleme akisi - gateway uzerinden eslestirme
// Adimlar: gateway sec -> bolge sec -> eslestirme -> tamam

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
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
    <View className="flex-1 p-5">
      <Text className="text-primary font-bold text-xl mb-5">
        {t.hardware.selectGateway}
      </Text>

      {isLoadingGateways ? (
        <View className="flex-1 center">
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={gateways}
          keyExtractor={(item) => item.gateway_id}
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="row surface-bg rounded-[10px]"
              style={{
                padding: 14,
                opacity: item.is_online ? 1 : 0.5,
                elevation: 1,
                shadowColor: theme.shadowColor,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
              }}
              onPress={() => handleGatewaySelect(item)}
              activeOpacity={item.is_online ? 0.7 : 1}
              disabled={!item.is_online}
            >
              <MaterialCommunityIcons
                name="access-point"
                size={24}
                color={item.is_online ? theme.primary : theme.textSecondary}
                style={{ marginRight: 12 }}
              />
              <View className="flex-1">
                <Text className="text-primary text-[15px] font-semibold mb-0.5">
                  {item.name || item.mac}
                </Text>
                <View className="row" style={{ gap: 6 }}>
                  <View
                    className="rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: item.is_online ? theme.success : theme.danger,
                    }}
                  />
                  <Text className="text-secondary text-xs">
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
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <TouchableOpacity
                    className="rounded-xl"
                    style={{ backgroundColor: theme.primary, paddingHorizontal: 10, paddingVertical: 4 }}
                    onPress={(e) => { e.stopPropagation(); handleOtaUpdate(item); }}
                  >
                    <Text className="text-white text-[11px] font-semibold">
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
                <Text className="text-secondary text-[11px] font-medium">
                  {t.hardware.gatewayOffline}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text className="text-secondary text-sm text-center mt-10">
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
      <View className="flex-1 p-5">
        <Text className="text-primary font-bold text-xl mb-5">
          {t.hardware.selectZone}
        </Text>

        {isLoadingZones ? (
          <View className="flex-1 center">
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={Object.entries(grouped)}
            keyExtractor={([key]) => key}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item: [fieldName, fieldZones] }) => (
              <View>
                <Text className="text-secondary text-[13px] font-bold uppercase tracking-wide mb-2 mt-2">
                  {fieldName}
                </Text>
                {fieldZones.map((zone) => (
                  <TouchableOpacity
                    key={zone.zone_id}
                    className="row surface-bg rounded-[10px] mb-2"
                    style={{
                      padding: 14,
                      elevation: 1,
                      shadowColor: theme.shadowColor,
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 2,
                    }}
                    onPress={() => handleZoneSelect(zone)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-radius"
                      size={24}
                      color={theme.primary}
                      style={{ marginRight: 12 }}
                    />
                    <View className="flex-1">
                      <Text className="text-primary text-[15px] font-semibold">
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
              <Text className="text-secondary text-sm text-center mt-10">
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
    <View className="flex-1 p-5">
      {!discoveredNode ? (
        // Bekleme durumu
        <View className="flex-1 center">
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={{ marginBottom: 24 }}
          />
          <Text className="text-primary text-lg font-bold text-center mb-2">
            {t.hardware.searchingNodes}
          </Text>
          <Text className="text-secondary text-sm text-center mb-6 leading-5">
            {t.hardware.powerOnSensor}
          </Text>
          <Text
            className="text-3xl font-bold mb-6"
            style={{ color: theme.primary }}
          >
            {formatTime(pairingTimeLeft)}
          </Text>

          {/* Zaman doldu */}
          {pairingTimeLeft === 0 && (
            <TouchableOpacity
              className="rounded-[10px] mt-4"
              style={{ backgroundColor: theme.primary, paddingVertical: 10, paddingHorizontal: 20 }}
              onPress={handleRetryPairing}
            >
              <Text className="text-white text-sm font-semibold">
                {t.hardware.retry}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // Node kesfedildi — onay/red ekrani
        <View className="flex-1 center">
          <View
            className="items-center surface-bg rounded-2xl w-full mb-4"
            style={{
              padding: 24,
              elevation: 2,
              shadowColor: theme.shadowColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
            }}
          >
            <MaterialCommunityIcons
              name="thermometer-lines"
              size={40}
              color={theme.primary}
              style={{ marginBottom: 12 }}
            />
            <Text className="text-primary text-lg font-bold mb-2">
              {t.hardware.nodeFound}
            </Text>
            <Text className="text-secondary text-[13px] font-mono mb-1">
              MAC: {discoveredNode.mac}
            </Text>

            {/* 20s geri sayim */}
            <Text
              className="text-3xl font-bold mt-3"
              style={{ color: approvalTimeLeft <= 5 ? theme.danger : theme.primary }}
            >
              {approvalTimeLeft}s
            </Text>
            <Text className="text-secondary text-xs text-center">
              {t.hardware.autoRejectNotice}: {approvalTimeLeft}s
            </Text>
          </View>

          {/* Approve / Decline buttons */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <TouchableOpacity
              className="flex-1 row justify-center rounded-xl mt-4"
              style={{ backgroundColor: theme.success, paddingVertical: 14, paddingHorizontal: 24, opacity: isApproving ? 0.5 : 1 }}
              onPress={handleApproveNode}
              activeOpacity={0.7}
              disabled={isApproving}
            >
              {isApproving ? (
                <ActivityIndicator size="small" color={theme.textOnPrimary} style={{ marginRight: 6 }} />
              ) : (
                <MaterialCommunityIcons name="check" size={20} color={theme.textOnPrimary} style={{ marginRight: 6 }} />
              )}
              <Text style={{ color: theme.textOnPrimary }} className="text-base font-bold">{t.hardware.approve}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 row justify-center rounded-xl mt-4"
              style={{ backgroundColor: theme.danger, paddingVertical: 14, paddingHorizontal: 24 }}
              onPress={handleDeclineNode}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={20} color={theme.textOnPrimary} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.textOnPrimary }} className="text-base font-bold">{t.hardware.decline}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // Basari ekrani
  const renderDone = (): React.JSX.Element => (
    <View className="flex-1 p-5 center">
      <View
        className="center rounded-full mb-6"
        style={{
          width: 100,
          height: 100,
          backgroundColor: theme.primary + "20",
        }}
      >
        <MaterialCommunityIcons
          name="check-circle"
          size={64}
          color={theme.primary}
        />
      </View>
      <Text className="text-primary text-xl font-bold mb-2 text-center">
        {t.hardware.nodePaired}
      </Text>
      <TouchableOpacity
        className="row justify-center rounded-xl mt-4"
        style={{ backgroundColor: theme.primary, paddingVertical: 14, paddingHorizontal: 24 }}
        onPress={onComplete}
        activeOpacity={0.7}
      >
        <Text className="text-white text-base font-bold">{t.hardware.done}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1">
      {/* Hata mesaji */}
      {error && (
        <View
          className="row rounded-lg mx-5 mt-2"
          style={{ backgroundColor: theme.danger + "20", paddingVertical: 10, paddingHorizontal: 16 }}
        >
          <MaterialCommunityIcons
            name="alert-circle"
            size={18}
            color={theme.danger}
            style={{ marginRight: 8 }}
          />
          <Text className="flex-1 text-[13px] font-medium" style={{ color: theme.danger }}>
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
          className="row px-5 py-3"
          onPress={handleStepBack}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={18}
            color={theme.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text className="text-secondary text-sm">
            {t.common.back}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
