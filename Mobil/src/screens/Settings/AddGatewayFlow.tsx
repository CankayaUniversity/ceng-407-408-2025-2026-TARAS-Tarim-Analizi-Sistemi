// Gateway ekleme akisi - BLE ile provizyon
// Adimlar: tarla sec -> BLE tara -> WiFi gir -> provizyon -> tamam

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BleManager, Device } from "react-native-ble-plx";
import { Theme } from "../../types";
import { useLanguage } from "../../context/LanguageContext";
import { gatewayAPI } from "../../utils/api";
import {
  requestPermissions,
  checkBLEState,
  scanForGateways,
  stopScan,
  provisionGateway,
} from "../../utils/ble";

type Step = "farmSelect" | "bleScan" | "wifiInput" | "provisioning" | "done";

interface AddGatewayFlowProps {
  theme: Theme;
  onComplete: () => void;
  onBack: () => void;
}

export const AddGatewayFlow = ({
  theme,
  onComplete,
  onBack,
}: AddGatewayFlowProps) => {
  const { t } = useLanguage();
  const bleManagerRef = useRef<BleManager | null>(null);
  const lastErrorRef = useRef<string>("");

  // Adim durumu
  const [step, setStep] = useState<Step>("farmSelect");
  const [error, setError] = useState<string | null>(null);

  // Adim 1: Ciftlik secimi
  interface FarmItem { farm_id: string; name: string; }
  const [farms, setFarms] = useState<FarmItem[]>([]);
  const [isLoadingFarms, setIsLoadingFarms] = useState(true);
  const [selectedFarm, setSelectedFarm] = useState<FarmItem | null>(null);

  // Adim 2: BLE tarama
  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  // Adim 3: WiFi bilgileri
  const [ssid, setSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");

  // Adim 4: Provizyon durumu
  const [provisionStatus, setProvisionStatus] = useState("");

  // BLE manager olustur ve temizle
  useEffect(() => {
    try {
      bleManagerRef.current = new BleManager();
      console.log("[BLE] manager olusturuldu");
    } catch (err) {
      console.log("[BLE] manager olusturulamadi (native modul yok):", err);
      setError("BLE bu ortamda desteklenmiyor. Lutfen gelistirme derlemesi kullanin.");
    }

    return () => {
      if (bleManagerRef.current) {
        stopScan(bleManagerRef.current);
        bleManagerRef.current.destroy();
        console.log("[BLE] manager yok edildi");
      }
    };
  }, []);

  // Tarla listesini cek
  useEffect(() => {
    const fetchFarms = async (): Promise<void> => {
      try {
        setIsLoadingFarms(true);
        const res = await gatewayAPI.getFarms();
        if (res.success && res.data) setFarms(res.data);
        console.log("[HW] ciftlikler:", res.data?.length);
      } catch (err) {
        console.log("[HW] tarla cekme hatasi:", err);
        setError(t.common.error);
      } finally {
        setIsLoadingFarms(false);
      }
    };
    fetchFarms();
  }, [t]);

  // Tarla secildiginde BLE taramaya gec
  const handleFarmSelect = useCallback((farm: FarmItem): void => {
    setSelectedFarm(farm);
    setError(null);
    setStep("bleScan");
  }, []);

  // BLE tarama baslat
  const handleStartScan = useCallback(async (): Promise<void> => {
    if (!bleManagerRef.current) return;

    setError(null);
    setDevices([]);
    setIsScanning(true);

    // Izinleri iste
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setError(t.hardware.blePermissionNeeded);
      setIsScanning(false);
      return;
    }

    // BLE acik mi kontrol et
    const bleReady = await checkBLEState(bleManagerRef.current);
    if (!bleReady) {
      setError(t.hardware.bleDisabled);
      setIsScanning(false);
      return;
    }

    // Taramaya basla - bulunan cihazlari listeye ekle
    const seenIds = new Set<string>();
    await scanForGateways(bleManagerRef.current, 30000, (device) => {
      if (!seenIds.has(device.id)) {
        seenIds.add(device.id);
        setDevices((prev) => [...prev, device]);
      }
    });

    setIsScanning(false);
  }, [t]);

  // Adim 2'ye gecindiginde otomatik tara
  useEffect(() => {
    if (step === "bleScan") {
      handleStartScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Cihaz sec ve WiFi girdisine gec
  const handleDeviceSelect = useCallback(
    (device: Device): void => {
      if (bleManagerRef.current) {
        stopScan(bleManagerRef.current);
      }
      setSelectedDevice(device);
      setError(null);
      setStep("wifiInput");
    },
    [],
  );

  // WiFi bilgileri girildi, provizyon baslat
  const handleConfigure = useCallback(async (): Promise<void> => {
    if (!ssid.trim()) {
      setError(t.hardware.ssidPlaceholder);
      return;
    }
    if (!selectedDevice || !selectedFarm || !bleManagerRef.current) return;

    setError(null);
    setStep("provisioning");

    try {
      // 1. Backend'e kaydet, api_key al
      setProvisionStatus(t.hardware.registering);
      console.log("[HW] gateway kaydediliyor:", selectedDevice.id);

      const registerResult = await gatewayAPI.register(
        selectedDevice.id,
        selectedFarm.farm_id,
        selectedDevice.name ?? undefined,
      );

      // Backend returns api_key at top level, authFetch returns raw JSON
      const regAny = registerResult as unknown as { success: boolean; api_key?: string; data?: { api_key?: string }; error?: string };
      const apiKey = regAny.api_key || regAny.data?.api_key;
      if (!regAny.success || !apiKey) {
        throw new Error(regAny.error || "Register failed");
      }
      console.log("[HW] gateway kaydedildi, api_key alindi");

      // 2. BLE ile provizyon
      setProvisionStatus(t.hardware.writingConfig);

      const success = await provisionGateway(
        bleManagerRef.current,
        selectedDevice.id,
        ssid,
        wifiPassword,
        apiKey,
        (statusByte) => {
          if (statusByte === 0x01) {
            setProvisionStatus(t.hardware.testingWifi);
          } else if (statusByte === 0xfe) {
            setProvisionStatus(t.hardware.wifiFailed);
            lastErrorRef.current = t.hardware.wifiFailed;
          } else if (statusByte === 0xfd) {
            setProvisionStatus(t.hardware.backendUnreachable);
            lastErrorRef.current = t.hardware.backendUnreachable;
          }
        },
      );

      if (success) {
        console.log("[HW] provizyon basarili");
        setStep("done");
      } else {
        throw new Error(lastErrorRef.current || t.hardware.provisionFailed);
      }
    } catch (err) {
      console.log(
        "[HW] provizyon hatasi:",
        err instanceof Error ? err.message : err,
      );
      setError(
        err instanceof Error ? err.message : t.hardware.connectionLost,
      );
      setStep("wifiInput");
    }
  }, [ssid, wifiPassword, selectedDevice, selectedFarm, t]);

  // Geri adim belirleme
  const handleStepBack = useCallback((): void => {
    setError(null);
    switch (step) {
      case "bleScan":
        if (bleManagerRef.current) stopScan(bleManagerRef.current);
        setStep("farmSelect");
        break;
      case "wifiInput":
        setStep("bleScan");
        break;
      case "provisioning":
        // Provizyon sırasında geri donme
        break;
      default:
        onBack();
    }
  }, [step, onBack]);

  // Tarla secim ekrani
  const renderFarmSelect = (): React.JSX.Element => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t.hardware.selectFarm}
      </Text>

      {isLoadingFarms ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={farms}
          keyExtractor={(item) => item.farm_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.listItem, { backgroundColor: theme.surface }]}
              onPress={() => handleFarmSelect(item)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="barn"
                size={24}
                color={theme.accent}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.listItemTitle, { color: theme.text }]}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.listItemSub,
                    { color: theme.textSecondary },
                  ]}
                >
                  {item.farm_id.substring(0, 8)}...
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.textSecondary}
              />
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

  // BLE tarama ekrani
  const renderBleScan = (): React.JSX.Element => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t.hardware.scanningGateways}
      </Text>

      {isScanning && (
        <View style={styles.scanningRow}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text
            style={[
              styles.scanningText,
              { color: theme.textSecondary },
            ]}
          >
            {t.hardware.scanningGateways}...
          </Text>
        </View>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: theme.surface }]}
            onPress={() => handleDeviceSelect(item)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="access-point"
              size={24}
              color={theme.accent}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.listItemTitle, { color: theme.text }]}>
                {item.name || item.id}
              </Text>
              <Text
                style={[
                  styles.listItemSub,
                  { color: theme.textSecondary },
                ]}
              >
                RSSI: {item.rssi ?? "N/A"} dBm
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.centerWrap}>
              <Text
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                {t.hardware.noGatewaysFound}
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: theme.accent }]}
                onPress={handleStartScan}
              >
                <Text style={styles.retryButtonText}>
                  {t.hardware.retry}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );

  // WiFi bilgi girdi ekrani
  const renderWifiInput = (): React.JSX.Element => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        {t.hardware.enterWifi}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
          SSID
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.accentDim,
            },
          ]}
          placeholder={t.hardware.ssidPlaceholder}
          placeholderTextColor={theme.textSecondary}
          value={ssid}
          onChangeText={setSsid}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
          {t.hardware.passwordPlaceholder}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.accentDim,
            },
          ]}
          placeholder={t.hardware.passwordPlaceholder}
          placeholderTextColor={theme.textSecondary}
          value={wifiPassword}
          onChangeText={setWifiPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
        onPress={handleConfigure}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="wifi-cog"
          size={20}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.primaryBtnText}>
          {t.hardware.configureGateway}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Provizyon durumu ekrani
  const renderProvisioning = (): React.JSX.Element => (
    <View style={[styles.stepContainer, styles.centerWrap]}>
      <ActivityIndicator
        size="large"
        color={theme.accent}
        style={{ marginBottom: 24 }}
      />
      <Text style={[styles.statusText, { color: theme.text }]}>
        {provisionStatus || t.hardware.provisioning}
      </Text>
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
        {t.hardware.gatewayConfigured}
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
      {step === "farmSelect" && renderFarmSelect()}
      {step === "bleScan" && renderBleScan()}
      {step === "wifiInput" && renderWifiInput()}
      {step === "provisioning" && renderProvisioning()}
      {step === "done" && renderDone()}

      {/* Geri butonu (provizyon ve tamam disinda) */}
      {step !== "provisioning" && step !== "done" && step !== "farmSelect" && (
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
  scanningRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  scanningText: {
    fontSize: 13,
    marginLeft: 10,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
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
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
