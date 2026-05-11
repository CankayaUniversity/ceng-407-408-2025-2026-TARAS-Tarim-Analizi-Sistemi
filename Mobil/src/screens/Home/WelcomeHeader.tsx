// Karsilama baslik — selamlama metni + tarla hava sicakligi ve nemi
import { View, Text } from "react-native";
import { FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import { Theme } from "../../utils/theme";
import { DashboardData } from "../../utils/api";
import { useLanguage } from "../../context/LanguageContext";
import { ms, s, spacing } from "../../utils/responsive";

interface WelcomeHeaderProps {
  theme: Theme;
  dashboardData: DashboardData | null;
}

export const WelcomeHeader = ({ theme, dashboardData }: WelcomeHeaderProps) => {
  const { t } = useLanguage();
  const temp = dashboardData?.weather?.airTemperature;
  const humidity = dashboardData?.weather?.airHumidity;

  return (
    <View
      style={{ paddingHorizontal: s(2), paddingTop: spacing.sm, paddingBottom: spacing.xs }}
    >
      <Text
        style={{
          fontSize: ms(20, 0.4),
          fontWeight: "700",
          color: theme.textMain,
          marginBottom: spacing.xs,
        }}
      >
        {t.irrigation.welcome} 
      </Text>

      <View style={{ flexDirection: "row", gap: s(10) }}>
        {/* Sicaklik */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}>
          <FontAwesome6
            name="temperature-three-quarters"
            size={ms(14, 0.3)}
            color={theme.textSecondary}
          />
          <Text
            style={{
              fontSize: ms(13, 0.3),
              color: theme.textSecondary,
              fontWeight: "500",
            }}
          >
            {temp != null ? `${temp.toFixed(1)} °C` : "—"}
          </Text>
        </View>

        {/* Nem */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}>
          <MaterialIcons
            name="water-drop"
            size={ms(14, 0.3)}
            color={theme.textSecondary}
          />
          <Text
            style={{
              fontSize: ms(13, 0.3),
              color: theme.textSecondary,
              fontWeight: "500",
            }}
          >
            {humidity != null ? `${humidity.toFixed(0)}%` : "—"}
          </Text>
        </View>
      </View>
    </View>
  );
};
