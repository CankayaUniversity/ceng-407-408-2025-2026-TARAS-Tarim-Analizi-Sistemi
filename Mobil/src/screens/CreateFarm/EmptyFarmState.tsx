// Bos ciftlik durumu — kullanicinin hic ciftligi yok, "Ciftlik Ekle" goster

import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

interface EmptyFarmStateProps {
  theme: any;
  onAddFarm: () => void;
}

export const EmptyFarmState = ({ theme, onAddFarm }: EmptyFarmStateProps) => {
  const { t } = useLanguage();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.background,
        padding: s(24),
      }}
    >
      <TouchableOpacity
        style={{
          width: s(80),
          height: s(80),
          borderRadius: s(40),
          backgroundColor: theme.primary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: vs(20),
        }}
        onPress={onAddFarm}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="plus"
          size={40}
          color={theme.textOnPrimary}
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={onAddFarm} activeOpacity={0.7}>
        <Text
          className="font-bold"
          style={{
            fontSize: ms(18, 0.3),
            color: theme.primary,
          }}
        >
          {t.farm.addFarm}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
