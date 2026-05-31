// Standart form girisi — etiket (opsiyonel) + kanonik TextInput (Login stili:
// surface zemin + 1px border + radius 12). AddField step'lerindeki 10/6/12 radius
// karmasasini tek stile ceker. style haric tum TextInput prop'lari gecer.

import { View, TextInput } from "react-native";
import type { StyleProp, ViewStyle, TextInputProps } from "react-native";
import type { Theme } from "../../../utils/theme";
import { s, vs, ms } from "../../../utils/responsive";
import { FieldLabel } from "./FieldLabel";

interface FormInputProps extends Omit<TextInputProps, "style"> {
  theme: Theme;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const FormInput = ({
  theme,
  label,
  containerStyle,
  ...rest
}: FormInputProps) => (
  <View style={containerStyle}>
    {label ? <FieldLabel theme={theme}>{label}</FieldLabel> : null}
    <TextInput
      placeholderTextColor={theme.textMuted}
      {...rest}
      style={{
        paddingVertical: vs(12),
        paddingHorizontal: s(16),
        borderWidth: 1,
        borderRadius: 12,
        borderColor: theme.border,
        fontSize: ms(15, 0.3),
        color: theme.textMain,
        backgroundColor: theme.surface,
      }}
    />
  </View>
);

export default FormInput;
