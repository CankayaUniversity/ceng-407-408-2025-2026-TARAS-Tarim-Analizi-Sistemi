// Onboarding secimi — kullanicinin erisebildigi ciftlik yok. Iki yol sunar:
// kendi ciftligini olustur (-> farmer) VEYA davet koduyla bir ciftlige katil (-> stakeholder).
// Kartlar FarmChoiceCards'tan gelir (Settings "Ciftlik Ekle" akisiyla ayni gorunum).

import { View } from "react-native";
import { s } from "../../utils/responsive";
import { FarmChoiceCards } from "./FarmChoiceCards";

interface EmptyFarmStateProps {
  theme: any;
  onCreateFarm: () => void;
  onJoinFarm: () => void;
}

export const EmptyFarmState = ({ theme, onCreateFarm, onJoinFarm }: EmptyFarmStateProps) => (
  <View
    style={{
      flex: 1,
      justifyContent: "center",
      backgroundColor: theme.background,
      paddingHorizontal: s(24),
    }}
  >
    <FarmChoiceCards
      theme={theme}
      onCreateFarm={onCreateFarm}
      onJoinFarm={onJoinFarm}
      showTitle
    />
  </View>
);
