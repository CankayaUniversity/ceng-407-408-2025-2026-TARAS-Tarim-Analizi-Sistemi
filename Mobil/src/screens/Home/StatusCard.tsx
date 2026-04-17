// Dashboard metrik kartlari - hava sicakligi, nem, sulama zamani gosterir
// Props: theme, dashboardData (API verisi), loading

import { View, Text } from "react-native";
import { FontAwesome6, MaterialIcons, Entypo } from "@expo/vector-icons";
import { MetricCard } from "./MetricCard";
import { IrrigationCountdown } from "./IrrigationCountdown";
import { StatusCardProps } from "./types";
import { ms } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

// Son okuma zamanini formatla - tarih ve saat gosterir
const formatLastReading = (
  isoTimestamp: string | null | undefined,
  language: string,
): string | null => {
  if (!isoTimestamp) return null;

  const date = new Date(isoTimestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  // Saat formatla (HH:MM)
  const timeStr = date.toLocaleTimeString(
    language === "tr" ? "tr-TR" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  );

  // Gun formatla
  if (isToday) {
    const dayLabel = language === "tr" ? "Bugün" : "Today";
    return `${dayLabel}, ${timeStr}`;
  }
  if (isYesterday) {
    const dayLabel = language === "tr" ? "Dün" : "Yesterday";
    return `${dayLabel}, ${timeStr}`;
  }

  // Daha eski tarihler icin gun/ay goster
  const dateStr = date.toLocaleDateString(
    language === "tr" ? "tr-TR" : "en-US",
    {
      day: "numeric",
      month: "short",
    },
  );
  return `${dateStr}, ${timeStr}`;
};

export const StatusCard = ({
  theme,
  dashboardData,
  loading,
}: StatusCardProps) => {
  const { t, language } = useLanguage();
  const airTemp = dashboardData?.weather?.airTemperature?.toFixed(1) ?? null;
  const airHumidity = dashboardData?.weather?.airHumidity?.toFixed(0) ?? null;
  const soilMoisture = dashboardData?.sensors?.soilMoisture?.toString() ?? null;
  const lastReadingTime = formatLastReading(
    dashboardData?.sensors?.lastReadingTime,
    language,
  );

  return (
    <View className="flex-1 px-1 pt-1">
      <View className="flex-row flex-wrap">
        <MetricCard
          theme={theme}
          title={t.home.airTemperature}
          value={airTemp}
          unit=" °C"
          icon={
            <FontAwesome6
              name="temperature-three-quarters"
              size={22}
              color={theme.primary}
            />
          }
          loading={loading}
        />
        <MetricCard
          theme={theme}
          title={t.home.airHumidity}
          value={airHumidity}
          icon={
            <MaterialIcons name="water-drop" size={22} color={theme.primary} />
          }
          loading={loading}
        />
      </View>

      <View className="flex-row flex-wrap">
        <MetricCard
          theme={theme}
          title={t.home.timeToIrrigation}
          value={
            <IrrigationCountdown
              theme={theme}
              isoTimestamp={dashboardData?.irrigation.nextIrrigationTime}
            />
          }
          unit={""}
          icon={<FontAwesome6 name="clock" size={22} color={theme.primary} />}
          loading={false}
        />
        <MetricCard
          theme={theme}
          title={t.home.soilMoisture}
          value={soilMoisture}
          icon={<Entypo name="air" size={22} color={theme.primary} />}
          loading={loading}
        />
      </View>

      {!loading && (
        <Text
          className="text-right mt-1 mr-1"
          style={{
            fontSize: ms(11, 0.3),
            color: theme.textSecondary,
          }}
        >
          {t.home.lastReading}: {lastReadingTime ?? "—"}
        </Text>
      )}
    </View>
  );
};
