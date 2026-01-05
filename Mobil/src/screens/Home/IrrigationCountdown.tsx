import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { Theme } from "../../utils/theme";
import { useResponsive, calculateCardDimensions, getResponsiveFontSize, spacing } from "../../utils/responsive";

interface IrrigationCountdownProps {
  theme: Theme;
  isoTimestamp?: string;
}

export const IrrigationCountdown = ({ theme, isoTimestamp }: IrrigationCountdownProps) => {
  const { screenWidth, screenHeight, isTablet } = useResponsive();

  // Calculate card dimensions using responsive utilities (same as MetricCard)
  const cardLayout = calculateCardDimensions(screenWidth, screenHeight, {
    horizontalPadding: spacing.md * 2, // 32px total
    cardsPerRow: 2,
    cardGap: spacing.sm, // 8px
    cardMargin: 4,
  });

  const countdownFontSize = getResponsiveFontSize(
    { base: 32, min: 28, max: isTablet ? 56 : 48, scaleFactorMultiplier: 0.40 },
    cardLayout.scaleFactor,
    isTablet
  );

  const [hours, setHours] = useState<string>("00");
  const [minutes, setMinutes] = useState<string>("00");
  const [colonVisible, setColonVisible] = useState<boolean>(true);

  const computeRemaining = () => {
    const now = new Date();
    let targetTime: Date;

    if (isoTimestamp) {
      targetTime = new Date(isoTimestamp);
    } else {
      targetTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        12,
        0,
        0,
        0,
      );
      if (now >= targetTime) {
        targetTime = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const diffMs = targetTime.getTime() - now.getTime();
    if (diffMs <= 0) {
      setHours("00");
      setMinutes("00");
      return;
    }
    const totalMinutes = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    setHours(String(h).padStart(2, "0"));
    setMinutes(String(m).padStart(2, "0"));
  };

  useEffect(() => {
    computeRemaining();
    const colonInterval = setInterval(() => setColonVisible((c) => !c), 1000);
    const now = new Date();
    const msUntilNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let minuteInterval: any = null;
    const minuteTimeout: any = setTimeout(() => {
      computeRemaining();
      minuteInterval = setInterval(computeRemaining, 60 * 1000);
    }, msUntilNextMinute);

    return () => {
      clearInterval(colonInterval);
      clearTimeout(minuteTimeout);
      if (minuteInterval) clearInterval(minuteInterval);
    };
  }, [isoTimestamp]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}>
      <Text
        style={{
          color: theme.text,
          fontSize: countdownFontSize,
          fontWeight: "400",
          lineHeight: countdownFontSize * 1.1,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {hours}
      </Text>
      <View
        style={{
          width: countdownFontSize * 0.3,
          alignItems: "center",
          justifyContent: "center",
          marginHorizontal: 1,
        }}
      >
        <Text
          style={{
            opacity: colonVisible ? 1 : 0,
            color: theme.text,
            fontSize: countdownFontSize,
            fontWeight: "400",
            lineHeight: countdownFontSize * 1.1,
          }}
        >
          {":"}
        </Text>
      </View>
      <Text
        style={{
          color: theme.text,
          fontSize: countdownFontSize,
          fontWeight: "400",
          lineHeight: countdownFontSize * 1.1,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {minutes}
      </Text>
    </View>
  );
};
