import { Text, View } from "react-native";
import { CarbonFootprintScreenProps } from "./types";

export const CarbonFootprintScreen = ({ theme }: CarbonFootprintScreenProps) => {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background }}>
      <Text style={{ fontSize: 24, color: theme.text, fontWeight: "600" }}>
        Karbon Ayak Izi
      </Text>
      <Text style={{ fontSize: 16, color: theme.textSecondary, marginTop: 12 }}>
        Yakinda...
      </Text>
    </View>
  );
};
