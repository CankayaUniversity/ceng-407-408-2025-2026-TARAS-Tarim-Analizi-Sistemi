// Sulama detay/giris ekrani — zone ozeti, sulama sorulari, gercek deger girisi, gecmis
// HomeScreen icinden tam ekran overlay olarak render edilir
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
import { Ionicons, FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Theme } from "../../utils/theme";
import { DashboardData, IrrigationJob, irrigationAPI, sensorAPI, ZoneDetailsData } from "../../utils/api";
import { NodeInfo } from "../../components/ColorPlane";
import { useLanguage } from "../../context/LanguageContext";
import { ms, s, spacing } from "../../utils/responsive";

interface IrrigationDetailProps {
  node: NodeInfo;
  nodeIndex: number;
  dashboardData: DashboardData;
  theme: Theme;
  onBack: () => void;
}

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

export const IrrigationDetailScreen = ({
  node,
  nodeIndex,
  dashboardData,
  theme,
  onBack,
}: IrrigationDetailProps) => {
  const { t, language } = useLanguage();

  // Sulama is verileri
  const [jobs, setJobs] = useState<IrrigationJob[]>([]);
  const [zoneDetails, setZoneDetails] = useState<ZoneDetailsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Form durumu
  // followedRecommendation: true = öneriyi tam uyguladım, false = farklı değer girdim
  const [followedRecommendation, setFollowedRecommendation] = useState<boolean | null>(null);
  const [actualAmount, setActualAmount] = useState("");
  const [actualTime, setActualTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mevcut/beklenen is — en yeni PENDING+should_irrigate jobunu sec
  const pendingJob = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .find((j) => j.status === "PENDING" && j.should_irrigate),
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

  // Kaydet
  const handleSave = useCallback(async () => {
    if (!pendingJob) return;
    setValidationError(null);

    // "No" yolu: kullanıcı girişlerini doğrula
    if (followedRecommendation === false) {
      const amountVal = parseFloat(actualAmount);
      if (!actualAmount.trim() || isNaN(amountVal) || amountVal <= 0) {
        setValidationError(t.irrigation.amountInvalid);
        return;
      }
    }

    setSaving(true);
    setSaveResult(null);

    const payload: { actual_water_amount_ml?: number; actual_start_time?: string } = {};

    if (followedRecommendation === true) {
      payload.actual_water_amount_ml = pendingJob.water_amount_ml ?? 0;
      payload.actual_start_time = pendingJob.start_time ?? new Date().toISOString();
    } else if (followedRecommendation === false) {
      payload.actual_water_amount_ml = parseFloat(actualAmount);
      payload.actual_start_time = actualTime.toISOString();
    }

    const res = await irrigationAPI.updateJobActual(pendingJob.job_id, payload);
    if (res.success) {
      setSaveResult("success");
      setFollowedRecommendation(null);
      setActualAmount("");
      setValidationError(null);
      await loadData();
    } else {
      setSaveResult("error");
    }
    setSaving(false);
  }, [pendingJob, followedRecommendation, actualAmount, actualTime, loadData, t.irrigation.amountInvalid]);

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
    followedRecommendation === true ||
    (followedRecommendation === false &&
      actualAmount.trim().length > 0 &&
      parseFloat(actualAmount) > 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Baslik */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginRight: spacing.sm }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.textMain} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: ms(18, 0.3),
            fontWeight: "700",
            color: theme.textMain,
            flex: 1,
          }}
        >
          {t.irrigation.detail}
        </Text>
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
            {/* Zone Ozeti */}
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 14,
                padding: spacing.md,
                borderWidth: 1,
                borderColor: theme.primary + "20",
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  fontSize: ms(17, 0.3),
                  fontWeight: "700",
                  color: theme.textMain,
                  marginBottom: spacing.sm,
                }}
              >
                {t.irrigation.zone} {nodeIndex + 1}
              </Text>

              <SummaryRow
                icon={<Ionicons name="water" size={16} color={theme.primary} />}
                label={t.irrigation.currentMoisture}
                value={`${Math.round(node.moisture)}%`}
                theme={theme}
              />
              <SummaryRow
                icon={<FontAwesome6 name="clock" size={14} color={theme.primary} />}
                label={t.irrigation.recommendedTime}
                value={formatDateTime(
                  pendingJob?.start_time ?? dashboardData.irrigation.nextIrrigationTime,
                  language,
                )}
                theme={theme}
              />
              <SummaryRow
                icon={<MaterialIcons name="water-drop" size={16} color={theme.primary} />}
                label={t.irrigation.recommendedAmount}
                value={
                  pendingJob?.water_amount_ml != null
                    ? `${Math.round(pendingJob.water_amount_ml)} ${t.irrigation.ml}`
                    : t.irrigation.noRecommendation
                }
                theme={theme}
                isLast={false}
              />
              {pendingJob && (
                <SummaryRow
                  icon={<Ionicons name="checkmark-circle-outline" size={16} color={theme.primary} />}
                  label={t.irrigation.status}
                  value={pendingJob.status}
                  theme={theme}
                  isLast={
                    !pendingJob.urgency_level &&
                    !pendingJob.recommendation_time &&
                    !pendingJob.reasoning &&
                    zoneDetails?.adaptive_config?.target_sm_percent == null &&
                    !zoneDetails?.active_plantings?.length
                  }
                />
              )}
              {pendingJob?.urgency_level && (
                <SummaryRow
                  icon={<Ionicons name="alert-circle-outline" size={16} color={theme.primary} />}
                  label={t.irrigation.urgencyLevel}
                  value={pendingJob.urgency_level}
                  theme={theme}
                  isLast={
                    !pendingJob.recommendation_time &&
                    !pendingJob.reasoning &&
                    zoneDetails?.adaptive_config?.target_sm_percent == null &&
                    !zoneDetails?.active_plantings?.length
                  }
                />
              )}
              {pendingJob?.recommendation_time && (
                <SummaryRow
                  icon={<FontAwesome6 name="clock" size={14} color={theme.primary} />}
                  label={t.irrigation.recommendationTime}
                  value={formatDateTime(pendingJob.recommendation_time, language)}
                  theme={theme}
                  isLast={
                    !pendingJob.reasoning &&
                    zoneDetails?.adaptive_config?.target_sm_percent == null &&
                    !zoneDetails?.active_plantings?.length
                  }
                />
              )}
              {zoneDetails?.adaptive_config?.target_sm_percent != null && (
                <SummaryRow
                  icon={<MaterialIcons name="track-changes" size={16} color={theme.primary} />}
                  label={t.irrigation.targetMoisture}
                  value={`${Math.round(zoneDetails.adaptive_config.target_sm_percent)}%`}
                  theme={theme}
                  isLast={!zoneDetails?.active_plantings?.length && !pendingJob?.reasoning}
                />
              )}
              {zoneDetails?.active_plantings?.[0] && (
                <SummaryRow
                  icon={<MaterialIcons name="grass" size={16} color={theme.primary} />}
                  label={t.irrigation.crop}
                  value={zoneDetails.active_plantings[0].crop_name}
                  theme={theme}
                  isLast={!zoneDetails.active_plantings[0].growth_stage && !pendingJob?.reasoning}
                />
              )}
              {zoneDetails?.active_plantings?.[0]?.growth_stage && (
                <SummaryRow
                  icon={<Ionicons name="leaf-outline" size={16} color={theme.primary} />}
                  label={t.irrigation.growthStage}
                  value={zoneDetails.active_plantings[0].growth_stage}
                  theme={theme}
                  isLast={!pendingJob?.reasoning}
                />
              )}
              {pendingJob?.reasoning && (
                <View
                  style={{
                    marginTop: spacing.xs,
                    paddingTop: spacing.xs,
                    borderTopWidth: 1,
                    borderTopColor: theme.divider,
                  }}
                >
                  <Text
                    style={{
                      fontSize: ms(12, 0.3),
                      color: theme.textSecondary,
                      marginBottom: 2,
                    }}
                  >
                    {t.irrigation.reasoning}
                  </Text>
                  <Text
                    style={{
                      fontSize: ms(13, 0.3),
                      color: theme.textMain,
                      lineHeight: ms(18, 0.3),
                    }}
                  >
                    {pendingJob.reasoning}
                  </Text>
                </View>
              )}
            </View>

            {pendingJob ? (
              <>
            {/* Sulama onayı — tek soru */}
            <Text
              style={{
                fontSize: ms(14, 0.3),
                fontWeight: "600",
                color: theme.textMain,
                marginBottom: spacing.sm,
              }}
            >
              {t.irrigation.confirmIrrigationQuestion}
            </Text>

            {/* Seçenek kartları */}
            <View style={{ gap: s(8) }}>
              {([true, false] as const).map((option) => {
                const isSelected = followedRecommendation === option;
                const label = option
                  ? t.irrigation.yesFollowedExactly
                  : t.irrigation.noUsedDifferent;
                return (
                  <TouchableOpacity
                    key={String(option)}
                    onPress={() => {
                      setFollowedRecommendation(option);
                      setValidationError(null);
                      setSaveResult(null);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: isSelected ? theme.primary : theme.border,
                      backgroundColor: isSelected
                        ? theme.primary + "12"
                        : theme.surface,
                      gap: s(10),
                    }}
                  >
                    <Ionicons
                      name={
                        isSelected
                          ? option
                            ? "checkmark-circle"
                            : "close-circle"
                          : "radio-button-off-outline"
                      }
                      size={22}
                      color={isSelected ? theme.primary : theme.textMuted}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: ms(13, 0.3),
                        fontWeight: isSelected ? "600" : "500",
                        color: isSelected ? theme.primary : theme.textMain,
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* "Hayır" seçilince: miktar + zaman girişi */}
            {followedRecommendation === false && (
              <View
                style={{
                  marginTop: spacing.md,
                  padding: spacing.md,
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  gap: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(13, 0.3),
                    fontWeight: "600",
                    color: theme.textMain,
                    marginBottom: spacing.xs,
                  }}
                >
                  {t.irrigation.enterActualValues}
                </Text>

                {/* Gerçek miktar */}
                <View>
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

                {/* Gerçek zaman */}
                <View>
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
                  {/* iOS: tarih ve saat picker'ı aynı anda göster */}
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
                      <Text
                        style={{
                          fontSize: ms(12, 0.3),
                          color: theme.textSecondary,
                        }}
                      >
                        {formatDateTime(job.actual_start_time ?? job.start_time ?? job.created_at, language)}
                      </Text>
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

// Ozet satiri yardimci bileşeni
const SummaryRow = ({
  icon,
  label,
  value,
  theme,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  theme: Theme;
  isLast?: boolean;
}) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.xs,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: theme.divider,
    }}
  >
    <View style={{ marginRight: s(8) }}>{icon}</View>
    <Text
      style={{
        flex: 1,
        fontSize: ms(13, 0.3),
        color: theme.textSecondary,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: ms(13, 0.3),
        fontWeight: "600",
        color: theme.textMain,
      }}
    >
      {value}
    </Text>
  </View>
);
