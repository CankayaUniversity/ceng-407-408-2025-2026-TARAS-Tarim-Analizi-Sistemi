// Metrik karti — tek bir olcum degerini gosterir (2x2 grid icinde)
import { View, Text, ActivityIndicator } from "react-native";
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
    <View className="flex-1" style={{ marginHorizontal: s(2), marginBottom: spacing.sm }}>
      <View
        className="border rounded-xl justify-between"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.primary + "20",
          padding: cardPadding,
          height: cardLayout.cardHeight,
        }}
      >
        {/* Baslik + ikon */}
        <View className="row-between">
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            className="font-semibold flex-1"
            style={{ color: theme.textSecondary, fontSize: titleFontSize }}
          >
            {title}
          </Text>
          <View style={{ marginLeft: s(4) }}>{icon}</View>
        </View>

        {/* Deger */}
        <View className="items-start flex-1" style={{ justifyContent: loading ? "center" : "flex-end" }}>
          {loading ? (
            <ActivityIndicator size={VALUE_FONT * 0.7} color={theme.primary} />
          ) : value !== null ? (
            typeof value === "string" ? (
              <View className="flex-row items-baseline">
                <Text
                  numberOfLines={1}
                  className="font-normal"
                  style={{ color: theme.textMain, fontSize: VALUE_FONT, lineHeight: VALUE_FONT * 1.1 }}
                >
                  {value}
                </Text>
                {unit?.trim() ? (
                  <Text
                    numberOfLines={1}
                    className="font-normal"
                    style={{ fontSize: UNIT_FONT, color: theme.textSecondary, marginLeft: s(2) }}
                  >
                    {unit.trim()}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View>{value}</View>
            )
          ) : (
            <Text className="font-normal" style={{ color: theme.textSecondary, fontSize: VALUE_FONT }}>
              {"\u2014"}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};
