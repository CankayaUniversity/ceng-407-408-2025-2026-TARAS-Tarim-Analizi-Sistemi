// Adim iskeleti — tutarli padding + opsiyonel baslik/alt-baslik/hata + CTA footer.
// Her step'in layout'u tekrar etmesin diye tek kaynak.
//
// scroll: ZORUNLU ayrim. true -> ScrollView (form step'leri). false -> duz View
// (GreenhousePolygonStep'in cizim canvas'i onResponderMove kullanir; ScrollView
// pan responder'i calar, sinir cizimi bozulur). Bu yuzden canvas step'i scroll=false.
//
// footer: CTA bolgesi, icerik sonunda akista (sticky degil).

import type { ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import type { Theme } from "../../../utils/theme";
import { s, vs, ms } from "../../../utils/responsive";
import { FormError } from "./FormError";

interface StepScaffoldProps {
  theme: Theme;
  title?: string;
  subtitle?: string;
  error?: string | null;
  scroll?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

export const StepScaffold = ({
  theme,
  title,
  subtitle,
  error,
  scroll = true,
  footer,
  children,
}: StepScaffoldProps) => {
  const body = (
    <>
      {title ? (
        <Text
          style={{
            fontSize: ms(20, 0.3),
            fontWeight: "700",
            color: theme.textMain,
            marginBottom: subtitle ? vs(4) : vs(12),
          }}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={{
            fontSize: ms(13, 0.3),
            color: theme.textSecondary,
            marginBottom: vs(12),
            lineHeight: ms(18, 0.3),
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      <FormError theme={theme} message={error} />
      {children}
      {footer ? <View style={{ marginTop: vs(16) }}>{footer}</View> : null}
    </>
  );

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(20), paddingBottom: vs(40) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    );
  }

  return <View style={{ flex: 1, padding: s(20) }}>{body}</View>;
};

export default StepScaffold;
