// Adimlarda tekrar eden hata kutusu — 4 step'te birebir kopyalanmisti.
// message bos/null ise hicbir sey cizmez. Reanimated FadeInDown ile yumusak girer
// (anlik "pat" diye belirme yerine), cikarken FadeOut.

import { Text } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Theme } from "../../../utils/theme";
import { s, vs, ms } from "../../../utils/responsive";

export const FormError = ({
  theme,
  message,
}: {
  theme: Theme;
  message?: string | null;
}) => {
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOut.duration(120)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 12,
        backgroundColor: theme.danger + "15",
        paddingVertical: vs(10),
        paddingHorizontal: s(14),
        marginBottom: vs(16),
      }}
    >
      <MaterialCommunityIcons
        name="alert-circle"
        size={18}
        color={theme.danger}
        style={{ marginRight: s(8) }}
      />
      <Text style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}>
        {message}
      </Text>
    </Animated.View>
  );
};

export default FormError;
