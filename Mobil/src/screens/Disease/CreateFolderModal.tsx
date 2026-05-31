// Klasor olusturma modali — zone seciminden sonra ad gir
// Backend POST /api/disease/folders { zoneId, name } cagirir
// Backend zone'da en yeni active planting'i bulur; yoksa hata doner

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useDashboard } from "../../context/DashboardContext";
import { spacing, vs, ms } from "../../utils/responsive";
import { OptionDropdown } from "../../components/OptionDropdown";
import { BottomSheet } from "../../components/BottomSheet";
import { ActionButton } from "../../components/ActionButton";
import { sensorAPI, diseaseAPI, type Zone, type DiseaseTrackingFolder } from "../../utils/api";

const NAME_MAX_LENGTH = 150;

interface CreateFolderModalProps {
  visible: boolean;
  theme: Theme;
  /** Mevcut folder listesi — ayni zone icin kac tane var bilmek + crop adini cekmek icin. */
  existingFolders: DiseaseTrackingFolder[];
  onClose: () => void;
  /** Basariyla olusturulduktan sonra parent'a yeni folder'i bildirir */
  onCreated: (folder: DiseaseTrackingFolder) => void;
}

export const CreateFolderModal = ({ visible, theme, existingFolders, onClose, onCreated }: CreateFolderModalProps) => {
  const { t, language } = useLanguage();
  const { showPopup } = usePopupMessage();
  const { selectedFieldId } = useDashboard();

  const [zones, setZones] = useState<Zone[] | null>(null);
  const [loadingZones, setLoadingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal acilinca zonelari yukle (cached da degil — taze veri lazim)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingZones(true);
    sensorAPI
      .getUserZones()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setZones(res.data.zones);
        } else {
          setZones([]);
          showPopup(res.error ?? t.disease.folderCreateZoneLoadError);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setZones([]);
        showPopup(t.disease.folderCreateZoneLoadError);
      })
      .finally(() => {
        if (!cancelled) setLoadingZones(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Modal her acildiginda state sifirla
  useEffect(() => {
    if (!visible) {
      setSelectedZoneId(null);
      setName("");
      setSubmitting(false);
    }
  }, [visible]);

  const selectedZone = useMemo(
    () => zones?.find((z) => z.zone_id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  useEffect(() => {
    if (!selectedZoneId) return;
    const sameZoneFolders = existingFolders.filter(
      (f) => f.planting.zoneId === selectedZoneId,
    );
    const cropName = sameZoneFolders[0]?.planting.cropName ?? null;
    const count = sameZoneFolders.length + 1;
    const baseName = language === "tr" ? "Hastalık takibi" : "Disease tracking";
    setName(`${cropName ? `${cropName} ` : ""}${baseName} #${count}`);
  }, [selectedZoneId, existingFolders, language]);

  const handleSubmit = async () => {
    if (!selectedZoneId) {
      showPopup(t.disease.folderCreatePickZone);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      showPopup(t.disease.folderCreateNameRequired);
      return;
    }

    setSubmitting(true);
    try {
      const res = await diseaseAPI.createFolder(selectedZoneId, trimmed);
      if (res.success && res.data) {
        onCreated(res.data);
        onClose();
        showPopup(t.disease.folderCreateSuccess);
      } else {
        const err = res.error ?? "";
        // Backend hata mesajlarini map et
        if (err.includes("Duplicate folder name")) {
          showPopup(t.disease.folderCreateDuplicateName);
        } else if (err.includes("No active planting") || err.includes("not found")) {
          showPopup(t.disease.folderCreateNoActivePlanting);
        } else {
          showPopup(err || t.disease.folderCreateGenericError);
        }
      }
    } catch {
      showPopup(t.disease.folderCreateGenericError);
    } finally {
      setSubmitting(false);
    }
  };

  // Selected field varsa o tarladaki zonelari sun. Yoksa hepsini goster (fallback).
  // Field selector kullanildigi icin diger tarlalar alakasiz; gosterirsek karisikliktur.
  const filteredZones = useMemo(() => {
    if (!zones) return [];
    if (!selectedFieldId) return zones;
    return zones.filter((z) => z.field_id === selectedFieldId);
  }, [zones, selectedFieldId]);
  const showFieldSubtitle = !selectedFieldId;

  // Zone secici secenekleri — field secili degilse tarla/ciftlik adini subtitle'da goster.
  const zoneOptions = filteredZones.map((z) => ({
    value: z.zone_id,
    label: z.zone_name,
    icon: "map-marker",
    subtitle: showFieldSubtitle ? `${z.field_name} · ${z.farm_name}` : undefined,
  }));

  return (
    <BottomSheet
      visible={visible}
      theme={theme}
      onClose={onClose}
      title={t.disease.folderCreateTitle}
      avoidKeyboard
      scroll
      // Bos alana dokununca diger sheet'ler gibi kapansin (klavye de kapanir). Eskiden
      // closeOnBackdropPress=false ile yalniz klavye kapaniyordu — kullanici talebiyle kaldirildi.
      maxHeightPct={80}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
      footer={
        // Cizelge filtresiyle ayni: sabit alt cubuk (border-top), scroll'la kaymaz.
        <View style={[styles.buttonRow, {
          paddingHorizontal: spacing.md,
          paddingTop: vs(10),
          borderTopWidth: 1,
          borderTopColor: theme.divider,
        }]}>
          <ActionButton
            theme={theme}
            label={t.common.cancel}
            variant="secondary"
            disabled={submitting}
            onPress={onClose}
          />
          <ActionButton
            theme={theme}
            label={t.disease.folderCreateConfirm}
            variant="primary"
            disabled={!selectedZoneId || name.trim().length === 0}
            loading={submitting}
            onPress={handleSubmit}
          />
        </View>
      }
    >
      <Text style={[styles.helper, { color: theme.textSecondary }]}>
        {t.disease.folderCreateHelper}
      </Text>

      {loadingZones ? (
        <View style={styles.loadingZones}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : !zones || filteredZones.length === 0 ? (
        <View style={[styles.emptyZones, { backgroundColor: theme.surface }]}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.textSecondary} />
          <Text style={[styles.emptyZonesText, { color: theme.textSecondary }]}>
            {t.disease.folderCreateNoZones}
          </Text>
        </View>
      ) : (
        <OptionDropdown
          theme={theme}
          label={t.disease.folderCreateHelper}
          showLabel={false}
          value={selectedZoneId ?? ""}
          options={zoneOptions}
          onChange={(v) => setSelectedZoneId(v)}
          displayLabel={selectedZoneId ? undefined : t.disease.folderCreateHelper}
          statusBarTranslucent
        />
      )}

      {/* Name input */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: spacing.md }]}>
        {t.disease.folderCreateNameLabel}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={
          selectedZone
            ? t.disease.folderCreateNamePlaceholder
            : t.disease.folderCreateNamePlaceholderEmpty
        }
        placeholderTextColor={theme.textSecondary + "80"}
        maxLength={NAME_MAX_LENGTH}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.textMain,
          },
        ]}
        editable={!submitting}
      />
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  helper: {
    fontSize: ms(12, 0.3),
    marginBottom: vs(12),
  },
  sectionLabel: {
    fontSize: ms(11, 0.3),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: vs(6),
  },
  loadingZones: {
    paddingVertical: vs(20),
    alignItems: "center",
  },
  emptyZones: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.sm,
    borderRadius: 12,
  },
  emptyZonesText: {
    fontSize: ms(12, 0.3),
    flex: 1,
  },
  input: {
    paddingHorizontal: spacing.sm,
    paddingVertical: vs(12),
    borderRadius: 12,
    borderWidth: 1,
    fontSize: ms(14, 0.3),
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: vs(16),
  },
});
