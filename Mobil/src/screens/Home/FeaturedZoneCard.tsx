// Secili zone karti — sulama önerisi varsa öneri detayları, yoksa nem + geri sayım
// Zone secimi 3D model uzerinden yapilir
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { NodeInfo } from "../../components/ColorPlane";
import { IrrigationSuggestion } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { ms, s, spacing } from "../../utils/responsive";

interface FeaturedZoneCardProps {
  theme: Theme;
  node: NodeInfo | null;
  nodeIndex: number;
  nextIrrigationTime: string | null;
  /** First PENDING job with should_irrigate === true from irrigationAPI.getZoneJobs(). */
  pendingSuggestion?: IrrigationSuggestion | null;
  /** Most recent EXECUTED job's actual_start_time ?? start_time. */
  lastIrrigationTime?: string | null;
  onPress: () => void;
}

// Nem damlasi — renk ve opakligi nem seviyesine gore degisir
const MoistureDroplet = ({
  moisture,
  theme,
  size = ms(44, 0.4),
}: {
  moisture: number;
  theme: Theme;
  size?: number;
}) => {
  const color =
    moisture < 30 ? theme.danger : moisture > 70 ? theme.info : theme.primary;
  const opacity = 0.35 + (moisture / 100) * 0.65;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + "15",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="water" size={size * 0.55} color={color} style={{ opacity }} />
    </View>
  );
};

// Kısa tarih/saat formatı — kart içi gösterim
const formatCardTime = (iso: string | null, language: string): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Aciliyet seviyesine göre tema rengi
const urgencyColor = (
  level: IrrigationSuggestion["urgency_level"],
  theme: Theme,
): string => {
  if (level === "high") return theme.danger;
  if (level === "medium") return theme.warning;
  if (level === "low") return theme.success;
  return theme.primary;
};

// Küçük renkli rozet — HIGH / MEDIUM / LOW
const UrgencyBadge = ({
  level,
  label,
  theme,
}: {
  level: IrrigationSuggestion["urgency_level"];
  label: string;
  theme: Theme;
}) => {
  const color = urgencyColor(level, theme);
  return (
    <View
      style={{
        paddingHorizontal: s(8),
        paddingVertical: 2,
        borderRadius: 20,
        backgroundColor: color + "20",
        borderWidth: 1,
        borderColor: color + "50",
      }}
    >
      <Text
        style={{
          fontSize: ms(10, 0.3),
          fontWeight: "700",
          color,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
};

export const FeaturedZoneCard = ({
  theme,
  node,
  nodeIndex,
  pendingSuggestion = null,
  lastIrrigationTime = null,
  onPress,
}: FeaturedZoneCardProps) => {
  const { t, language } = useLanguage();

  if (!node) return null;

  const moisture = Math.round(node.moisture);
  const accentCol = pendingSuggestion
    ? urgencyColor(pendingSuggestion.urgency_level, theme)
    : theme.primary;

  const urgencyLabel = pendingSuggestion?.urgency_level === "high"
    ? t.irrigation.urgencyHigh
    : pendingSuggestion?.urgency_level === "medium"
    ? t.irrigation.urgencyMedium
    : pendingSuggestion?.urgency_level === "low"
    ? t.irrigation.urgencyLow
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: pendingSuggestion ? accentCol + "50" : theme.primary + "30",
        overflow: "hidden",
        marginHorizontal: s(2),
        marginBottom: spacing.sm,
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
        flexDirection: "row",
      }}
    >
      {/* Renk aksanı — sol kenar çubuğu, aciliyet seviyesine göre renklenir */}
      <View
        style={{
          width: 4,
          backgroundColor: accentCol,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        }}
      />

      {/* Kart içeriği */}
      <View style={{ flex: 1, padding: spacing.md }}>

        {/* Üst satır: zone adı + sağ element */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: ms(15, 0.3),
              fontWeight: "700",
              color: theme.textMain,
            }}
          >
            {t.irrigation.zone} {nodeIndex + 1}
          </Text>

          {pendingSuggestion ? (
            /* Öneri varsa: aciliyet rozeti + chevron */
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
              {urgencyLabel && (
                <UrgencyBadge
                  level={pendingSuggestion.urgency_level}
                  label={urgencyLabel}
                  theme={theme}
                />
              )}
              <Ionicons name="chevron-forward" size={ms(16, 0.3)} color={theme.textSecondary} />
            </View>
          ) : (
            /* Öneri yoksa: nem yüzdesi + damla + chevron */
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
              <Text
                style={{
                  fontSize: ms(13, 0.3),
                  fontWeight: "600",
                  color: theme.textSecondary,
                }}
              >
                {moisture}%
              </Text>
              <MoistureDroplet moisture={moisture} theme={theme} />
              <Ionicons name="chevron-forward" size={ms(16, 0.3)} color={theme.textSecondary} />
            </View>
          )}
        </View>

        {/* Ana içerik — iki durum */}
        <View style={{ marginTop: spacing.xs }}>
          {pendingSuggestion ? (
            /* ── DURUM A: Aktif öneri var ────────────────────────────── */
            <>
              {/* Öneri mesajı */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(5),
                  marginBottom: spacing.xs,
                }}
              >
                <Ionicons name="alert-circle" size={14} color={accentCol} />
                <Text
                  style={{
                    fontSize: ms(12, 0.3),
                    fontWeight: "600",
                    color: accentCol,
                  }}
                >
                  {t.irrigation.pendingRecommendation}
                </Text>
              </View>

              {/* Önerilen miktar + zaman */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing.md,
                }}
              >
                {pendingSuggestion.water_amount_ml != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}>
                    <Ionicons name="water" size={13} color={theme.info} />
                    <Text
                      style={{
                        fontSize: ms(13, 0.3),
                        fontWeight: "600",
                        color: theme.textMain,
                      }}
                    >
                      {Math.round(pendingSuggestion.water_amount_ml)} {t.irrigation.ml}
                    </Text>
                  </View>
                )}
                {pendingSuggestion.start_time && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}>
                    <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
                    <Text
                      style={{
                        fontSize: ms(13, 0.3),
                        fontWeight: "600",
                        color: theme.textMain,
                      }}
                    >
                      {formatCardTime(pendingSuggestion.start_time, language)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            /* ── DURUM B: Aktif öneri yok ── */
            <>
              <Text
                style={{
                  fontSize: ms(13, 0.3),
                  color: theme.textSecondary,
                }}
              >
                {t.irrigation.noSuggestion}
              </Text>
              {lastIrrigationTime && (
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    color: theme.textMuted,
                    marginTop: spacing.xs,
                  }}
                >
                  {t.irrigation.lastIrrigation}: {formatCardTime(lastIrrigationTime, language)}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

