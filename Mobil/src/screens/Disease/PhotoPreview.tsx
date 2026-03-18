// Fotograf onizleme - cekilen fotoyu gosterir, iptal/gonder butonlari
// Props: theme, photoUri, onCancel, onSend

import { View, Image, Text, TouchableOpacity } from "react-native";
import { appStyles } from "../../styles";
import { PhotoPreviewProps } from "./types";
import { useLanguage } from "../../context/LanguageContext";

export const PhotoPreview = ({
  theme,
  photoUri,
  onCancel,
  onSend,
}: PhotoPreviewProps) => {
  const { t } = useLanguage();

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.background + "CC",
      }}
    >
      <Image
        source={{ uri: photoUri }}
        style={{ width: "86%", aspectRatio: 1, borderRadius: 12 }}
        resizeMode="cover"
      />
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.textSecondary,
            marginRight: 8,
          }}
        >
          <Text style={{ color: theme.text }}>{t.camera.cancelButton}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSend}
          style={[appStyles.primaryButton, { backgroundColor: theme.accent }]}
        >
          <Text
            style={[appStyles.primaryButtonText, { color: theme.background }]}
          >
            {t.camera.sendButton}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
