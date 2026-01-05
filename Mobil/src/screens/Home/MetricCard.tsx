import { View, Text, ActivityIndicator } from "react-native";
import { MetricCardProps } from "./types";
import { useResponsive, calculateCardDimensions, getResponsiveFontSize, spacing, fontSizes, getResponsiveSpacing } from "../../utils/responsive";

export const MetricCard = ({
  title,
  value,
  unit = " %",
  icon,
  theme,
  loading,
}: MetricCardProps) => {
  const { screenWidth, screenHeight, isTablet } = useResponsive();

  // Calculate card dimensions using responsive utilities
  const cardLayout = calculateCardDimensions(screenWidth, screenHeight, {
    horizontalPadding: spacing.md * 2, // 32px total (StatusCard padding)
    cardsPerRow: 2,
    cardGap: spacing.sm, // 8px
    cardMargin: 4,
  });

  // Responsive sizing for card elements
  const cardPadding = getResponsiveSpacing(10, screenWidth, 8, 16);

  const titleFontSize = getResponsiveFontSize(
    { ...fontSizes.sm, scaleFactorMultiplier: 0.09 },
    cardLayout.scaleFactor,
    isTablet
  );

  const valueFontSize = getResponsiveFontSize(
    { base: 32, min: 28, max: isTablet ? 56 : 48, scaleFactorMultiplier: 0.40 },
    cardLayout.scaleFactor,
    isTablet
  );

  const unitFontSize = valueFontSize * 0.4;

  // Icon size calculated but not used - icons are passed as props with their own sizes
  // const iconSize = getResponsiveFontSize(
  //   { ...fontSizes.lg, scaleFactorMultiplier: 0.15 },
  //   cardLayout.scaleFactor,
  //   isTablet
  // );

  return (
    <View style={{ flex: 1, marginHorizontal: 4, marginBottom: spacing.sm }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.accent + "20",
          borderWidth: 1,
          borderRadius: 12,
          padding: cardPadding,
          height: cardLayout.cardHeight,
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: theme.textSecondary,
              fontSize: titleFontSize,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {title}
          </Text>
          <View style={{ marginLeft: 4 }}>{icon}</View>
        </View>

        <View style={{ alignItems: "flex-start", justifyContent: loading ? "center" : "flex-end", flex: 1 }}>
          {loading ? (
            <ActivityIndicator size={valueFontSize * 0.7} color={theme.accent} />
          ) : value !== null ? (
            typeof value === "string" ? (
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: valueFontSize,
                    fontWeight: "400",
                    lineHeight: valueFontSize * 1.1,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {value}
                </Text>
                {unit && unit.trim() ? (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: unitFontSize,
                      fontWeight: "400",
                      marginLeft: 2,
                    }}
                    numberOfLines={1}
                  >
                    {unit.trim()}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View>{value}</View>
            )
          ) : null}
        </View>
      </View>
    </View>
  );
};
