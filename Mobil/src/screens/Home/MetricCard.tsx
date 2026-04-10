// Metrik karti — tek bir olcum degerini gosterir (2x2 grid icinde)
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { MetricCardProps } from "./types";
import {
  useResponsive,
  calculateCardDimensions,
  getResponsiveFontSize,
  spacing,
  fontSizes,
  getResponsiveSpacing,
  s,
  ms,
} from "../../utils/responsive";

const VALUE_FONT = ms(36, 0.5);
const UNIT_FONT = ms(14, 0.5);

export const MetricCard = ({
  title,
  value,
  unit = " %",
  icon,
  theme,
  loading,
}: MetricCardProps) => {
  const { screenWidth, screenHeight, isTablet } = useResponsive();

  const cardLayout = calculateCardDimensions(screenWidth, screenHeight, {
    horizontalPadding: s(12) * 2,
    cardsPerRow: 2,
    cardGap: s(6),
    cardMargin: s(2),
  });

  const cardPadding = getResponsiveSpacing(10, screenWidth, 8, 16);
  const titleFontSize = getResponsiveFontSize(
    { ...fontSizes.sm, scaleFactorMultiplier: 0.09 },
    cardLayout.scaleFactor,
    isTablet,
  );

  return (
    <View style={[styles.wrapper, { marginHorizontal: s(2), marginBottom: spacing.sm }]}>
      <View
        style={[styles.card, {
          backgroundColor: theme.surface,
          borderColor: theme.accent + "20",
          padding: cardPadding,
          height: cardLayout.cardHeight,
        }]}
      >
        {/* Baslik + ikon */}
        <View style={styles.header}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.title, { color: theme.textSecondary, fontSize: titleFontSize }]}
          >
            {title}
          </Text>
          <View style={styles.iconWrap}>{icon}</View>
        </View>

        {/* Deger */}
        <View style={[styles.valueArea, { justifyContent: loading ? "center" : "flex-end" }]}>
          {loading ? (
            <ActivityIndicator size={VALUE_FONT * 0.7} color={theme.accent} />
          ) : value !== null ? (
            typeof value === "string" ? (
              <View style={styles.valueRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.value, { color: theme.text, fontSize: VALUE_FONT, lineHeight: VALUE_FONT * 1.1 }]}
                >
                  {value}
                </Text>
                {unit?.trim() ? (
                  <Text numberOfLines={1} style={[styles.unit, { color: theme.textSecondary }]}>
                    {unit.trim()}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View>{value}</View>
            )
          ) : (
            <Text style={[styles.value, { color: theme.textSecondary, fontSize: VALUE_FONT }]}>
              —
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontWeight: "600", flex: 1 },
  iconWrap: { marginLeft: s(4) },
  valueArea: { alignItems: "flex-start", flex: 1 },
  valueRow: { flexDirection: "row", alignItems: "baseline" },
  value: { fontWeight: "400" },
  unit: { fontSize: UNIT_FONT, fontWeight: "400", marginLeft: s(2) },
});
