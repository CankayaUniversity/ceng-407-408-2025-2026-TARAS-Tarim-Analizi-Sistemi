// Fotograf onizleme - cekilen fotoyu gosterir, iptal/gonder butonlari
// Props: theme, photoUri, onCancel, onSend

import { View, Image, Text, TouchableOpacity } from "react-native";
import { PhotoPreviewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

export const PhotoPreview = ({
  theme,
  photoUri,
  onCancel,
  onSend,
}: PhotoPreviewProps) => {
  const { t } = useLanguage();

  return (
    <View
      className="overlay-fill"
      style={{ backgroundColor: theme.background + "CC" }}
    >
      <Image
        source={{ uri: photoUri }}
        style={{ width: "86%", aspectRatio: 1, borderRadius: 12 }}
        resizeMode="cover"
      />
      <View className="flex-row" style={{ marginTop: vs(16) }}>
        <TouchableOpacity
          onPress={onCancel}
          className="rounded-lg surface-bg"
          style={{
            paddingHorizontal: s(16),
            paddingVertical: vs(10),
            borderWidth: 1,
            borderColor: theme.textSecondary,
            marginRight: s(8),
          }}
        >
          <Text className="text-primary">
            {t.camera.cancelButton}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSend}
          className="rounded-xl"
          style={{
            backgroundColor: theme.accent,
            paddingVertical: vs(14),
            paddingHorizontal: s(24),
          }}
        >
          <Text
            className="text-center font-bold"
            style={{ color: theme.background, fontSize: ms(16, 0.3) }}
          >
            {t.camera.sendButton}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
