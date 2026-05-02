// Klasor olusturma modali — zone seciminden sonra ad gir
// Backend POST /api/disease/folders { zoneId, name } cagirir
// Backend zone'da en yeni active planting'i bulur; yoksa hata doner

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useDashboard } from "../../context/DashboardContext";
import { spacing, s, vs, ms } from "../../utils/responsive";
import { sensorAPI, diseaseAPI, type Zone, type DiseaseTrackingFolder } from "../../utils/api";

const NAME_MAX_LENGTH = 150;

interface CreateFolderModalProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  /** Basariyla olusturulduktan sonra parent'a yeni folder'i bildirir */
  onCreated: (folder: DiseaseTrackingFolder) => void;
}

export const CreateFolderModal = ({ visible, theme, onClose, onCreated }: CreateFolderModalProps) => {
  const { t } = useLanguage();
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

  const canSubmit = !!selectedZoneId && name.trim().length > 0 && !submitting;

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <BlurView
        intensity={40}
        tint={theme.isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      {/* Backdrop tap = klavyeyi kapat (modal kapanmasin) */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.center}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.primary + "30" },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.textMain }]}>
              {t.disease.folderCreateTitle}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.helper, { color: theme.textSecondary }]}>
            {t.disease.folderCreateHelper}
          </Text>

          {/* Zone picker */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {t.disease.folderCreateZoneLabel}
          </Text>
          {loadingZones ? (
            <View style={styles.loadingZones}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : !zones || filteredZones.length === 0 ? (
            <View style={[styles.emptyZones, { backgroundColor: theme.background }]}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.textSecondary} />
              <Text style={[styles.emptyZonesText, { color: theme.textSecondary }]}>
                {t.disease.folderCreateNoZones}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.zoneList}
              showsVerticalScrollIndicator={false}
            >
              {filteredZones.map((z) => {
                const selected = selectedZoneId === z.zone_id;
                return (
                  <TouchableOpacity
                    key={z.zone_id}
                    onPress={() => setSelectedZoneId(z.zone_id)}
                    activeOpacity={0.8}
                    style={[
                      styles.zoneRow,
                      {
                        backgroundColor: selected ? theme.primary + "15" : theme.background,
                        borderColor: selected ? theme.primary : theme.primary + "15",
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.zoneName, { color: theme.textMain }]}
                        numberOfLines={1}
                      >
                        {z.zone_name}
                      </Text>
                      {showFieldSubtitle && (
                        <Text
                          style={[styles.zoneSubtitle, { color: theme.textSecondary }]}
                          numberOfLines={1}
                        >
                          {z.field_name} · {z.farm_name}
                        </Text>
                      )}
                    </View>
                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={theme.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
                backgroundColor: theme.background,
                borderColor: theme.primary + "25",
                color: theme.textMain,
              },
            ]}
            editable={!submitting}
          />

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={onClose}
              disabled={submitting}
              style={[
                styles.button,
                { borderWidth: 1, borderColor: theme.textSecondary + "40", opacity: submitting ? 0.5 : 1 },
              ]}
            >
              <Text style={{ color: theme.textMain, fontWeight: "600", fontSize: ms(14, 0.3) }}>
                {t.common.cancel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.button,
                {
                  backgroundColor: canSubmit ? theme.primary : theme.primary + "55",
                  opacity: canSubmit ? 1 : 0.7,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: ms(14, 0.3) }}>
                  {t.disease.folderCreateConfirm}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

void s;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: spacing.md,
    maxHeight: "80%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: vs(4),
  },
  title: {
    fontSize: ms(18, 0.3),
    fontWeight: "700",
  },
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
    borderRadius: 8,
  },
  emptyZonesText: {
    fontSize: ms(12, 0.3),
    flex: 1,
  },
  zoneList: {
    maxHeight: 220,
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  zoneName: {
    fontSize: ms(14, 0.3),
    fontWeight: "600",
  },
  zoneSubtitle: {
    fontSize: ms(11, 0.3),
    marginTop: 1,
  },
  input: {
    paddingHorizontal: spacing.sm,
    paddingVertical: vs(12),
    borderRadius: 10,
    borderWidth: 1,
    fontSize: ms(14, 0.3),
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: vs(16),
  },
  button: {
    flex: 1,
    paddingVertical: vs(13),
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
