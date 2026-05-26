// Sulama detay/giris ekrani — zone ozeti, sulama sorulari, gercek deger girisi, gecmis
// HomeStack icinde pageSheet (iOS) / card (Android) navigation screen olarak render edilir
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Svg, { Path, Defs, ClipPath, Rect } from "react-native-svg";
import DateTimePicker from "@react-native-community/datetimepicker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { IrrigationJob, irrigationAPI, sensorAPI, ZoneDetailsData } from "../../utils/api";
import { palette } from "../../styles/colors";
import type { Theme } from "../../utils/theme";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { ms, s, vs, spacing } from "../../utils/responsive";
import { getUrgencyLabel, getUrgencyColor } from "../../utils/labels";
import type { IrrigationDetailNavProps } from "../Home/HomeStack";

// Tarih/saat formatla
const formatDateTime = (iso: string | null, language: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Tarih/saat formatla — tam ay adi ("26 Mayıs, 03:00")
const formatDateTimeLong = (iso: string | null, language: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Evet/Hayir dugme grubu
const YesNoToggle = ({
  value,
  onChange,
  theme,
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  onChange: (val: boolean) => void;
  theme: Theme;
  yesLabel: string;
  noLabel: string;
}) => (
  <View style={{ flexDirection: "row", gap: s(8) }}>
    {[true, false].map((option) => {
      const selected = value === option;
      return (
        <TouchableOpacity
          key={String(option)}
          onPress={() => onChange(option)}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: selected ? theme.primary : theme.border,
            backgroundColor: selected ? theme.primary + "12" : "transparent",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: ms(14, 0.3),
              fontWeight: selected ? "700" : "500",
              color: selected ? theme.primary : theme.textSecondary,
            }}
          >
            {option ? yesLabel : noLabel}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export const IrrigationDetailScreen = ({ route, navigation }: IrrigationDetailNavProps) => {
  const { node, nodeIndex } = route.params;
  const { theme } = useTheme();
  const { dashboardData, selectedFieldId } = useDashboard();
  const { t, language } = useLanguage();
  const { showPopup } = usePopupMessage();

  // Sulama is verileri
  const [jobs, setJobs] = useState<IrrigationJob[]>([]);
  const [zoneDetails, setZoneDetails] = useState<ZoneDetailsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Form durumu
  const [followedAmount, setFollowedAmount] = useState<boolean | null>(null);
  const [followedTime, setFollowedTime] = useState<boolean | null>(null);
  const [actualAmount, setActualAmount] = useState("");
  const [actualTime, setActualTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manuel sulama form durumu
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [manualTime, setManualTime] = useState(new Date());
  const [showManualDatePicker, setShowManualDatePicker] = useState(false);
  const [showManualTimePicker, setShowManualTimePicker] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSaveResult, setManualSaveResult] = useState<"success" | "error" | null>(null);
  const [manualValidationError, setManualValidationError] = useState<string | null>(null);
  const [runningRecommendation, setRunningRecommendation] = useState(false);

  const isPotField = dashboardData?.field?.isPotField === true;

  // Mevcut/beklenen is — en yeni PENDING+should_irrigate jobunu sec
  const pendingJob = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .find((j) => j.status === "PENDING" && j.should_irrigate),
    [jobs],
  );
  // En yeni NO_ACTION — "sistem kontrol etti, sulama gerekmiyor" durumu
  const noActionJob = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .find((j) => j.status === "NO_ACTION"),
    [jobs],
  );
  const historyJobs = useMemo(
    () => jobs.filter((j) => j.status === "EXECUTED"),
    [jobs],
  );

  // Zone sulama verilerini ve detaylarini yukle
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const zoneId = node.zone_id;
    if (!zoneId) {
      setError("No zone assigned to this sensor.");
      setLoading(false);
      return;
    }
    const [jobsRes, detailsRes] = await Promise.all([
      irrigationAPI.getZoneJobs(zoneId, nodeIndex),
      sensorAPI.getZoneDetails(zoneId),
    ]);
    if (jobsRes.success && jobsRes.data) {
      setJobs(jobsRes.data);
    } else if (!jobsRes.success) {
      setError(jobsRes.error ?? "Error");
    }
    if (detailsRes.success && detailsRes.data) {
      setZoneDetails(detailsRes.data);
    }
    setLoading(false);
  }, [node.id, nodeIndex]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sulama onerisi olustur — secili field'in tum zone'lari icin
  const handleRunRecommendation = useCallback(async () => {
    if (!selectedFieldId || runningRecommendation) return;
    setRunningRecommendation(true);
    try {
      // Zone ID'lerini topla
      const zoneIds: string[] = [];
      const jobsRes = await irrigationAPI.getFieldJobs(selectedFieldId);
      if (jobsRes.success && jobsRes.data) {
        const fromJobs = [...new Set(
          jobsRes.data.map((j) => j.zone_id).filter((id): id is string => id != null),
        )];
        zoneIds.push(...fromJobs);
      }
      if (zoneIds.length === 0) {
        const fromNodes = [...new Set(
          (dashboardData?.field?.nodes ?? [])
            .map((n) => n.zone_id).filter((id): id is string => id != null),
        )];
        zoneIds.push(...fromNodes);
      }
      if (zoneIds.length === 0) {
        showPopup(t.irrigation.noZonesFound);
        setRunningRecommendation(false);
        return;
      }
      let successCount = 0;
      let failCount = 0;
      let noPlantingCount = 0;
      await Promise.all(
        zoneIds.map(async (zoneId) => {
          try {
            const res = await irrigationAPI.runForZone(zoneId);
            if (res.success) successCount++;
            else {
              failCount++;
              if (res.error?.includes("No active planting")) noPlantingCount++;
            }
          } catch {
            failCount++;
          }
        }),
      );
      if (noPlantingCount > 0 && noPlantingCount === failCount) {
        showPopup(t.irrigation.noPlantingError);
      } else if (failCount > 0) {
        showPopup(`${successCount} ${t.irrigation.zonesSuccess}, ${failCount} ${t.irrigation.zonesFailed}`);
      } else {
        showPopup(t.irrigation.recommendationGenerated);
      }
      await loadData();
    } catch {
      showPopup(t.irrigation.recommendationFailed);
    } finally {
      setRunningRecommendation(false);
    }
  }, [selectedFieldId, runningRecommendation, dashboardData, showPopup, t, loadData]);

  // Kaydet
  const handleSave = useCallback(async () => {
    if (!pendingJob) return;
    setValidationError(null);

    // "No" miktarı yolu: kullanıcı girişlerini doğrula
    if (followedAmount === false) {
      const amountVal = parseFloat(actualAmount);
      if (!actualAmount.trim() || isNaN(amountVal) || amountVal <= 0) {
        setValidationError(t.irrigation.amountInvalid);
        return;
      }
    }

    setSaving(true);
    setSaveResult(null);

    const payload: { actual_water_amount_ml?: number; actual_start_time?: string; actual_duration_min?: number } = {};

    if (isPotField) {
      payload.actual_water_amount_ml =
        followedAmount === true
          ? (pendingJob.water_amount_ml ?? 0)
          : parseFloat(actualAmount);
    } else {
      payload.actual_duration_min =
        followedAmount === true
          ? (pendingJob.recommended_duration_min ?? 0)
          : parseFloat(actualAmount);
    }

    payload.actual_start_time =
      followedTime === true
        ? (pendingJob.start_time ?? new Date().toISOString())
        : actualTime.toISOString();

    const res = await irrigationAPI.updateJobActual(pendingJob.job_id, payload);
    if (res.success) {
      setSaveResult("success");
      setFollowedAmount(null);
      setFollowedTime(null);
      setActualAmount("");
      setValidationError(null);
      await loadData();
    } else {
      setSaveResult("error");
    }
    setSaving(false);
  }, [pendingJob, followedAmount, followedTime, actualAmount, actualTime, loadData, t.irrigation.amountInvalid]);

  // DateTimePicker handler
  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) {
      const merged = new Date(actualTime);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setActualTime(merged);
      // Android: tarih secildikten sonra saat picker'i ac
      if (Platform.OS === "android") {
        setTimeout(() => setShowTimePicker(true), 300);
      }
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) {
      const merged = new Date(actualTime);
      merged.setHours(selected.getHours(), selected.getMinutes());
      setActualTime(merged);
    }
  };

  const canSave =
    followedAmount !== null &&
    followedTime !== null &&
    (followedAmount === true ||
      (actualAmount.trim().length > 0 && parseFloat(actualAmount) > 0));

  // Manuel sulama kaydet
  const handleManualSave = useCallback(async () => {
    setManualValidationError(null);

    if (isPotField) {
      const val = parseFloat(manualAmount);
      if (!manualAmount.trim() || isNaN(val) || val <= 0) {
        setManualValidationError(t.irrigation.amountInvalid);
        return;
      }
    } else {
      const val = parseFloat(manualDuration);
      if (!manualDuration.trim() || isNaN(val) || val <= 0) {
        setManualValidationError(t.irrigation.amountInvalid);
        return;
      }
    }

    if (manualTime.getTime() > Date.now() + 60_000) {
      setManualValidationError(t.irrigation.amountInvalid);
      return;
    }

    const zoneId = node.zone_id;
    if (!zoneId) return;

    setManualSaving(true);
    setManualSaveResult(null);

    const payload: {
      actual_start_time: string;
      actual_water_amount_ml?: number;
      actual_duration_min?: number;
    } = {
      actual_start_time: manualTime.toISOString(),
    };

    if (isPotField) {
      payload.actual_water_amount_ml = parseFloat(manualAmount);
    } else {
      payload.actual_duration_min = parseFloat(manualDuration);
    }

    console.log("[MANUAL_IRRIGATION] zone_id:", zoneId, "isPotField:", isPotField, "pendingJob:", !!pendingJob, "payload:", payload);

    const res = await irrigationAPI.createManualActual(zoneId, payload);

    console.log("[MANUAL_IRRIGATION] response:", res.success, res.data?.job?.job_id, res.data?.job?.status);

    if (res.success) {
      setManualSaveResult("success");
      setManualAmount("");
      setManualDuration("");
      setManualValidationError(null);
      await loadData();
    } else {
      setManualSaveResult("error");
    }
    setManualSaving(false);
  }, [isPotField, manualAmount, manualDuration, manualTime, node.zone_id, pendingJob, loadData, t.irrigation.amountInvalid]);

  // Manuel sulama DateTimePicker handler'lari
  const onManualDateChange = (_: any, selected?: Date) => {
    setShowManualDatePicker(false);
    if (selected) {
      const merged = new Date(manualTime);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setManualTime(merged);
      if (Platform.OS === "android") {
        setTimeout(() => setShowManualTimePicker(true), 300);
      }
    }
  };

  const onManualTimeChange = (_: any, selected?: Date) => {
    setShowManualTimePicker(false);
    if (selected) {
      const merged = new Date(manualTime);
      merged.setHours(selected.getHours(), selected.getMinutes());
      setManualTime(merged);
    }
  };

  const canManualSave = isPotField
    ? manualAmount.trim().length > 0 && parseFloat(manualAmount) > 0
    : manualDuration.trim().length > 0 && parseFloat(manualDuration) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Baslik — bolge adi birincil, mahsul ikincil */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginRight: spacing.sm }}
        >
          <Ionicons name="chevron-down" size={26} color={theme.textMain} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: ms(18, 0.3),
              fontWeight: "700",
              color: theme.textMain,
            }}
          >
            {t.irrigation.zone} {nodeIndex + 1}
          </Text>
          {zoneDetails?.active_plantings?.[0]?.crop_name ? (
            <Text
              style={{
                fontSize: ms(13, 0.3),
                color: theme.textSecondary,
                marginTop: 1,
              }}
            >
              {zoneDetails.active_plantings[0].crop_name}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={handleRunRecommendation}
          disabled={runningRecommendation}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: runningRecommendation ? theme.border : theme.primary,
            borderRadius: 8,
            paddingVertical: vs(6),
            paddingHorizontal: s(10),
            gap: s(4),
          }}
        >
          {runningRecommendation ? (
            <ActivityIndicator size="small" color={theme.textOnPrimary} />
          ) : (
            <MaterialCommunityIcons name="water-check" size={16} color={theme.textOnPrimary} />
          )}
          <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textOnPrimary }}>
            {t.irrigation.recommendButton}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : error ? (
          <View style={{ padding: spacing.xxl, alignItems: "center", gap: spacing.md }}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.danger} />
            <Text
              style={{
                fontSize: ms(14, 0.3),
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
            <TouchableOpacity
              onPress={loadData}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                backgroundColor: theme.primary,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color: theme.textOnPrimary,
                  fontWeight: "600",
                  fontSize: ms(14, 0.3),
                }}
              >
                {t.common.retry}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 1. Oneri ozeti — yan yana: damla (sol) + miktar (sag) ── */}
            {(() => {
              const moisture = Math.round(node.moisture);
              const moistureClamped = Math.min(Math.max(moisture, 0), 100);
              const targetMoisture =
                zoneDetails?.adaptive_config?.target_sm_percent ??
                pendingJob?.target_sm;
              const dropColor =
                moistureClamped < 30
                  ? palette.soilMoisture[300]
                  : moistureClamped < 60
                    ? palette.soilMoisture[500]
                    : palette.soilMoisture[700];
              const svgSize = s(88);
              const fillY = 100 - moistureClamped;
              const hasRecommendation = pendingJob?.water_amount_ml != null;

              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: spacing.md,
                    marginBottom: spacing.xs,
                  }}
                >
                  {/* Sol kolon: Damla (%40) */}
                  <View
                    style={{
                      width: "40%",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ width: svgSize, height: svgSize }}>
                      <Svg
                        width={svgSize}
                        height={svgSize}
                        viewBox="0 0 100 100"
                      >
                        <Defs>
                          <ClipPath id="dropClip">
                            <Path d="M50 5 C50 5,15 45,15 65 C15 84,31 95,50 95 C69 95,85 84,85 65 C85 45,50 5,50 5Z" />
                          </ClipPath>
                        </Defs>
                        <Path
                          d="M50 5 C50 5,15 45,15 65 C15 84,31 95,50 95 C69 95,85 84,85 65 C85 45,50 5,50 5Z"
                          fill={dropColor + "18"}
                        />
                        <Rect
                          x="0"
                          y={fillY}
                          width="100"
                          height={100 - fillY}
                          fill={dropColor + "40"}
                          clipPath="url(#dropClip)"
                        />
                        <Path
                          d="M50 5 C50 5,15 45,15 65 C15 84,31 95,50 95 C69 95,85 84,85 65 C85 45,50 5,50 5Z"
                          fill="none"
                          stroke={dropColor + "50"}
                          strokeWidth="2"
                        />
                      </Svg>
                      <View
                        style={{
                          position: "absolute",
                          top: svgSize * 0.6,
                          left: 0,
                          right: 0,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: ms(18, 0.3),
                            fontWeight: "800",
                            color: dropColor,
                          }}
                        >
                          {moisture}%
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: ms(11, 0.3),
                        color: theme.textSecondary,
                        marginTop: s(4),
                      }}
                    >
                      {t.irrigation.currentMoisture}
                    </Text>
                    {targetMoisture != null && (
                      <Text
                        style={{
                          fontSize: ms(10, 0.3),
                          color: theme.textMuted,
                          marginTop: 1,
                        }}
                      >
                        {t.irrigation.targetMoisture}: {Math.round(targetMoisture)}%
                      </Text>
                    )}
                  </View>

                  {/* Sag kolon: Oneri (%60) */}
                  <View
                    style={{
                      width: "60%",
                      alignItems: "center",
                    }}
                  >
                    {hasRecommendation ? (
                      <>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "baseline",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: ms(38, 0.3),
                              fontWeight: "800",
                              color: theme.primary,
                            }}
                          >
                            {Math.round(pendingJob!.water_amount_ml!)}
                          </Text>
                          <Text
                            style={{
                              fontSize: ms(16, 0.3),
                              fontWeight: "600",
                              color: theme.primary,
                              marginLeft: s(4),
                            }}
                          >
                            {t.irrigation.ml}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: ms(13, 0.3),
                            color: theme.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          {t.irrigation.irrigationRecommended}
                        </Text>

                        {/* Zaman + Aciliyet */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            marginTop: spacing.sm,
                            gap: s(6),
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Ionicons
                              name="time-outline"
                              size={13}
                              color={theme.textSecondary}
                            />
                            <Text
                              style={{
                                fontSize: ms(12, 0.3),
                                color: theme.textSecondary,
                                marginLeft: s(3),
                              }}
                            >
                              {formatDateTimeLong(
                                pendingJob!.start_time,
                                language,
                              )}
                            </Text>
                          </View>
                          {pendingJob!.urgency_level ? (
                            <View
                              style={{
                                backgroundColor:
                                  theme[
                                    getUrgencyColor(
                                      pendingJob!.urgency_level,
                                    )
                                  ] + "18",
                                paddingHorizontal: s(8),
                                paddingVertical: s(2),
                                borderRadius: s(8),
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: ms(11, 0.3),
                                  fontWeight: "700",
                                  color:
                                    theme[
                                      getUrgencyColor(
                                        pendingJob!.urgency_level,
                                      )
                                    ],
                                }}
                              >
                                {getUrgencyLabel(
                                  pendingJob!.urgency_level,
                                  t.irrigation,
                                )}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </>
                    ) : (
                      <Text
                        style={{
                          fontSize: ms(14, 0.3),
                          color: theme.textMuted,
                        }}
                      >
                        {t.irrigation.noRecommendation}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* ── 2. Aciklama karti (ayri) ── */}
            {pendingJob ? (
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 14,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: theme.primary + "15",
                  marginBottom: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(14, 0.3),
                    fontWeight: "700",
                    color: theme.textMain,
                    marginBottom: s(6),
                  }}
                >
                  {t.irrigation.whyRecommended}
                </Text>
                <Text
                  style={{
                    fontSize: ms(13, 0.3),
                    color: theme.textSecondary,
                    lineHeight: ms(19, 0.3),
                  }}
                >
                  {t.irrigation.defaultReasoning}
                </Text>
              </View>
            ) : null}

            {pendingJob ? (
              <>
            {/* Soru 1: Miktar */}
            <Text
              style={{
                fontSize: ms(14, 0.3),
                fontWeight: "600",
                color: theme.textMain,
                marginBottom: spacing.sm,
              }}
            >
              {t.irrigation.amountQuestion}
            </Text>
            <YesNoToggle
              value={followedAmount}
              onChange={(val) => {
                setFollowedAmount(val);
                setValidationError(null);
                setSaveResult(null);
              }}
              theme={theme}
              yesLabel={t.common.yes}
              noLabel={t.common.no}
            />

            {/* Miktar girişi — "Hayır" seçilince */}
            {followedAmount === false && (
              <View
                style={{
                  marginTop: spacing.sm,
                  padding: spacing.md,
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                    marginBottom: 4,
                  }}
                >
                  {t.irrigation.actualAmount}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: validationError ? theme.danger : theme.border,
                    borderRadius: 10,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    fontSize: ms(16, 0.3),
                    color: theme.textMain,
                  }}
                  value={actualAmount}
                  onChangeText={(v) => {
                    setActualAmount(v);
                    setValidationError(null);
                  }}
                  placeholder={t.irrigation.enterAmount}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                />
                {validationError ? (
                  <Text
                    style={{
                      fontSize: ms(11, 0.3),
                      color: theme.danger,
                      marginTop: 4,
                    }}
                  >
                    {validationError}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Soru 2: Zaman */}
            <Text
              style={{
                fontSize: ms(14, 0.3),
                fontWeight: "600",
                color: theme.textMain,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              {t.irrigation.timeQuestion}
            </Text>
            <YesNoToggle
              value={followedTime}
              onChange={(val) => {
                setFollowedTime(val);
                setSaveResult(null);
              }}
              theme={theme}
              yesLabel={t.common.yes}
              noLabel={t.common.no}
            />

            {/* Zaman girişi — "Hayır" seçilince */}
            {followedTime === false && (
              <View
                style={{
                  marginTop: spacing.sm,
                  padding: spacing.md,
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                    marginBottom: 4,
                  }}
                >
                  {t.irrigation.actualTime}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: ms(15, 0.3), color: theme.textMain }}>
                    {actualTime.toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={actualTime}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                  />
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={actualTime}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onTimeChange}
                    is24Hour={true}
                  />
                )}
                {Platform.OS === "ios" && showDatePicker && (
                  <DateTimePicker
                    value={actualTime}
                    mode="time"
                    display="spinner"
                    onChange={onTimeChange}
                    is24Hour={true}
                  />
                )}
              </View>
            )}

            {/* Kaydet butonu */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave || saving}
              style={{
                backgroundColor: canSave && !saving ? theme.primary : theme.border,
                borderRadius: 12,
                paddingVertical: spacing.md,
                alignItems: "center",
                marginTop: spacing.lg,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.textOnPrimary} />
              ) : (
                <Text
                  style={{
                    fontSize: ms(15, 0.3),
                    fontWeight: "700",
                    color: canSave ? theme.textOnPrimary : theme.textMuted,
                  }}
                >
                  {t.irrigation.save}
                </Text>
              )}
            </TouchableOpacity>

            {/* Kayit sonucu */}
            {saveResult === "success" && (
              <Text
                style={{
                  textAlign: "center",
                  marginTop: spacing.sm,
                  fontSize: ms(13, 0.3),
                  color: theme.success,
                  fontWeight: "600",
                }}
              >
                {t.irrigation.saved}
              </Text>
            )}
            {saveResult === "error" && (
              <Text
                style={{
                  textAlign: "center",
                  marginTop: spacing.sm,
                  fontSize: ms(13, 0.3),
                  color: theme.danger,
                  fontWeight: "600",
                }}
              >
                {t.irrigation.saveFailed}
              </Text>
            )}
              </>
            ) : noActionJob ? (
              /* Sistem kontrol etti, sulama gerekmiyor — gerekçeyi göster */
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 10,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: theme.success + "40",
                  marginTop: spacing.sm,
                  gap: spacing.sm,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={theme.success}
                  />
                  <Text
                    style={{
                      fontSize: ms(15, 0.3),
                      fontWeight: "700",
                      color: theme.textMain,
                      flex: 1,
                    }}
                  >
                    {t.irrigation.noIrrigationNeeded}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: ms(13, 0.3),
                    color: theme.textSecondary,
                    lineHeight: ms(18, 0.3),
                  }}
                >
                  {noActionJob.reasoning ?? t.irrigation.noIrrigationNeededSub}
                </Text>
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    color: theme.textMuted,
                  }}
                >
                  {t.irrigation.lastChecked}:{" "}
                  {formatDateTime(noActionJob.created_at, language)}
                </Text>
                {!showManualForm && (
                  <TouchableOpacity
                    onPress={() => {
                      setShowManualForm(true);
                      setManualSaveResult(null);
                    }}
                    style={{
                      marginTop: spacing.sm,
                      paddingVertical: spacing.sm,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + "12",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: s(6),
                    }}
                  >
                    <MaterialIcons name="water-drop" size={16} color={theme.primary} />
                    <Text
                      style={{
                        fontSize: ms(14, 0.3),
                        fontWeight: "600",
                        color: theme.primary,
                      }}
                    >
                      {t.irrigation.manualIrrigation}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: spacing.xxl,
                  gap: spacing.sm,
                }}
              >
                <Ionicons name="water-outline" size={40} color={theme.textMuted} />
                <Text
                  style={{
                    fontSize: ms(15, 0.3),
                    fontWeight: "600",
                    color: theme.textMain,
                    textAlign: "center",
                  }}
                >
                  {t.irrigation.noActiveRecommendation}
                </Text>
                <Text
                  style={{
                    fontSize: ms(13, 0.3),
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t.irrigation.noActiveRecommendationSub}
                </Text>
                {!showManualForm && (
                  <TouchableOpacity
                    onPress={() => {
                      setShowManualForm(true);
                      setManualSaveResult(null);
                    }}
                    style={{
                      marginTop: spacing.sm,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + "12",
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: s(6),
                    }}
                  >
                    <MaterialIcons name="water-drop" size={16} color={theme.primary} />
                    <Text
                      style={{
                        fontSize: ms(14, 0.3),
                        fontWeight: "600",
                        color: theme.primary,
                      }}
                    >
                      {t.irrigation.manualIrrigation}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Manuel sulama formu */}
            {!pendingJob && showManualForm && (
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 14,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: theme.primary + "30",
                  marginTop: spacing.md,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: ms(15, 0.3),
                      fontWeight: "700",
                      color: theme.textMain,
                    }}
                  >
                    {t.irrigation.manualIrrigation}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowManualForm(false);
                      setManualSaveResult(null);
                      setManualValidationError(null);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={{
                        fontSize: ms(13, 0.3),
                        color: theme.textSecondary,
                        fontWeight: "500",
                      }}
                    >
                      {t.irrigation.cancel}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                    marginBottom: spacing.md,
                  }}
                >
                  {t.irrigation.manualIrrigationDesc}
                </Text>

                {/* Zaman secici */}
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                    marginBottom: 4,
                  }}
                >
                  {t.irrigation.manualTime}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowManualDatePicker(true)}
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: spacing.md,
                  }}
                >
                  <Text style={{ fontSize: ms(15, 0.3), color: theme.textMain }}>
                    {manualTime.toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
                </TouchableOpacity>

                {showManualDatePicker && (
                  <DateTimePicker
                    value={manualTime}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onManualDateChange}
                    maximumDate={new Date()}
                  />
                )}
                {showManualTimePicker && (
                  <DateTimePicker
                    value={manualTime}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onManualTimeChange}
                    is24Hour={true}
                  />
                )}
                {Platform.OS === "ios" && showManualDatePicker && (
                  <DateTimePicker
                    value={manualTime}
                    mode="time"
                    display="spinner"
                    onChange={onManualTimeChange}
                    is24Hour={true}
                  />
                )}

                {/* Miktar veya sure girisi */}
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    color: theme.textSecondary,
                    marginBottom: 4,
                  }}
                >
                  {isPotField ? t.irrigation.manualAmount : t.irrigation.manualDuration}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: manualValidationError ? theme.danger : theme.border,
                    borderRadius: 10,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    fontSize: ms(16, 0.3),
                    color: theme.textMain,
                  }}
                  value={isPotField ? manualAmount : manualDuration}
                  onChangeText={(v) => {
                    if (isPotField) {
                      setManualAmount(v);
                    } else {
                      setManualDuration(v);
                    }
                    setManualValidationError(null);
                  }}
                  placeholder={isPotField ? t.irrigation.enterAmount : t.irrigation.enterDuration}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                />
                {manualValidationError && (
                  <Text
                    style={{
                      fontSize: ms(11, 0.3),
                      color: theme.danger,
                      marginTop: 4,
                    }}
                  >
                    {manualValidationError}
                  </Text>
                )}

                {/* Kaydet butonu */}
                <TouchableOpacity
                  onPress={handleManualSave}
                  disabled={!canManualSave || manualSaving}
                  style={{
                    backgroundColor: canManualSave && !manualSaving ? theme.primary : theme.border,
                    borderRadius: 12,
                    paddingVertical: spacing.md,
                    alignItems: "center",
                    marginTop: spacing.lg,
                  }}
                >
                  {manualSaving ? (
                    <ActivityIndicator size="small" color={theme.textOnPrimary} />
                  ) : (
                    <Text
                      style={{
                        fontSize: ms(15, 0.3),
                        fontWeight: "700",
                        color: canManualSave ? theme.textOnPrimary : theme.textMuted,
                      }}
                    >
                      {t.irrigation.save}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Sonuc mesaji */}
                {manualSaveResult === "success" && (
                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: spacing.sm,
                      fontSize: ms(13, 0.3),
                      color: theme.success,
                      fontWeight: "600",
                    }}
                  >
                    {t.irrigation.manualSaved}
                  </Text>
                )}
                {manualSaveResult === "error" && (
                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: spacing.sm,
                      fontSize: ms(13, 0.3),
                      color: theme.danger,
                      fontWeight: "600",
                    }}
                  >
                    {t.irrigation.manualSaveFailed}
                  </Text>
                )}
              </View>
            )}

            {/* Sulama gecmisi */}
            <View style={{ marginTop: spacing.xl }}>
              <Text
                style={{
                  fontSize: ms(16, 0.3),
                  fontWeight: "700",
                  color: theme.textMain,
                  marginBottom: spacing.sm,
                }}
              >
                {t.irrigation.history}
              </Text>

              {historyJobs.length === 0 ? (
                <Text
                  style={{
                    fontSize: ms(13, 0.3),
                    color: theme.textMuted,
                    textAlign: "center",
                    paddingVertical: spacing.lg,
                  }}
                >
                  {t.irrigation.noHistory}
                </Text>
              ) : (
                historyJobs.map((job) => (
                  <View
                    key={job.job_id}
                    style={{
                      backgroundColor: theme.surface,
                      borderRadius: 10,
                      padding: spacing.sm,
                      marginBottom: spacing.xs,
                      borderWidth: 1,
                      borderColor: theme.border + "40",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                        <Text
                          style={{
                            fontSize: ms(12, 0.3),
                            color: theme.textSecondary,
                          }}
                        >
                          {formatDateTime(job.actual_start_time ?? job.start_time ?? job.created_at, language)}
                        </Text>
                        {job.urgency_level === "manual" && (
                          <View
                            style={{
                              backgroundColor: theme.info + "20",
                              paddingHorizontal: s(6),
                              paddingVertical: 1,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: ms(10, 0.3),
                                fontWeight: "600",
                                color: theme.info,
                              }}
                            >
                              {t.irrigation.manualIrrigation}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: ms(14, 0.3),
                          fontWeight: "600",
                          color: theme.textMain,
                          marginTop: 2,
                        }}
                      >
                        {job.actual_water_amount_ml != null
                          ? `${Math.round(job.actual_water_amount_ml)} ${t.irrigation.ml}`
                          : job.actual_duration_min != null
                            ? `${Math.round(job.actual_duration_min)} ${language === "tr" ? "dk" : "min"}`
                            : job.water_amount_ml != null
                              ? `${Math.round(job.water_amount_ml)} ${t.irrigation.ml}`
                              : "—"}
                      </Text>
                    </View>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.success}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};



