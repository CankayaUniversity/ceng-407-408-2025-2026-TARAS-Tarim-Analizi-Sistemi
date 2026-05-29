// Adimlardaki tekrar eden alan basligi — "Tarla adi", "Saksi sayisi" vb.
// Tek kaynak: ~8 inline label Text'in yerini alir.

import { Text } from "react-native";
import type { Theme } from "../../../utils/theme";
import { ms, vs } from "../../../utils/responsive";

export const FieldLabel = ({
  theme,
  children,
}: {
  theme: Theme;
  children: string;
}) => (
  <Text
    style={{
      fontSize: ms(13, 0.3),
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: vs(6),
    }}
  >
    {children}
  </Text>
);

export default FieldLabel;
