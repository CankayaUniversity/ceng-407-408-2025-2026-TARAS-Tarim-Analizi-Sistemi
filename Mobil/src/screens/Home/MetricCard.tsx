import { View, Text, ActivityIndicator, useWindowDimensions } from "react-native";
import { MetricCardProps } from "./types";

export const MetricCard = ({
  title,
  value,
  unit = " %",
  icon,
  theme,
  loading,
}: MetricCardProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const isTablet = screenWidth >= 768;

  const horizontalPadding = 32;
  const cardGap = 8;
  const cardsPerRow = 2;
  const cardWidth = (screenWidth - horizontalPadding - cardGap * (cardsPerRow - 1)) / cardsPerRow;

  const cardHeight = Math.max(100, Math.min(screenHeight * 0.15, 160));

  const scaleFactor = Math.min(cardWidth, cardHeight);

  const valueFontSize = Math.max(24, Math.min(scaleFactor * 0.28, isTablet ? 48 : 40));
  const titleFontSize = Math.max(10, Math.min(scaleFactor * 0.09, isTablet ? 14 : 12));
  const unitFontSize = Math.max(10, valueFontSize * 0.4);
  const iconSize = Math.max(18, Math.min(scaleFactor * 0.15, isTablet ? 26 : 22));
  const cardPadding = Math.max(8, Math.min(scaleFactor * 0.08, 16));

  return (
    <View style={{ flex: 1, marginHorizontal: 4, marginBottom: 8 }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.accent + "20",
          borderWidth: 1,
          borderRadius: 12,
          padding: cardPadding,
          height: cardHeight,
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
