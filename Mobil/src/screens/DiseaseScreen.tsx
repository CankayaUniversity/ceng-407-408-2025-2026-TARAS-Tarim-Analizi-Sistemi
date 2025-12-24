import { View, Text, TouchableOpacity } from 'react-native';
import { CameraView, PermissionResponse } from 'expo-camera';
import { appStyles } from '../styles';

interface DiseaseScreenProps {
  theme: any;
  permission: PermissionResponse | null;
  onRequestPermission: () => void;
}

export const DiseaseScreen = ({ theme, permission, onRequestPermission }: DiseaseScreenProps) => {
  if (!permission) {
    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>Kamera İzni</Text>
        <TouchableOpacity
          style={[appStyles.primaryButton, { backgroundColor: theme.accent, marginTop: 24 }]}
          onPress={onRequestPermission}
        >
          <Text style={[appStyles.primaryButtonText, { color: theme.background }]}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
        <Text style={[appStyles.placeholderText, { color: theme.text }]}>Kamera Erişimi Reddedildi</Text>
        <Text style={[appStyles.placeholderSub, { color: theme.textSecondary, marginBottom: 24 }]}>
          Bu özelliği kullanmak için cihaz ayarlarında kamera izinlerini etkinleştirin.
        </Text>
        <TouchableOpacity
          style={[appStyles.primaryButton, { backgroundColor: theme.accent }]}
          onPress={onRequestPermission}
        >
          <Text style={[appStyles.primaryButtonText, { color: theme.background }]}>Yeniden Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[appStyles.cameraContainer, { backgroundColor: theme.background }]}>
      <View style={[appStyles.cameraBorderContainer, { borderColor: theme.accent }]}>
        <CameraView style={appStyles.cameraView} facing="back" />
      </View>
    </View>
  );
};
