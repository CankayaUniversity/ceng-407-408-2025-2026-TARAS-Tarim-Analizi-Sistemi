import { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { ScreenType, SCREEN_TYPE } from '../constants';

interface LoginScreenProps {
  theme: any;
  onLoginSuccess: () => void;
  onSkip: () => void;
}

export const LoginScreen = ({ theme, onLoginSuccess, onSkip }: LoginScreenProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    setEmail('');
    setPassword('');
    onLoginSuccess();
  };

  const handleSkip = () => {
    setEmail('');
    setPassword('');
    onSkip();
  };

  return (
    <View style={[appStyles.loginContainer, { backgroundColor: theme.background }]}>
      <MaterialCommunityIcons name="hospital-box" size={64} color={theme.accent} style={{ marginBottom: 24 }} />
      <Text style={[appStyles.loginTitle, { color: theme.text }]}>TARAS</Text>
      <Text style={[appStyles.loginSubtitle, { color: theme.textSecondary }]}>
        Tarım Dijital İkiz Platformu
      </Text>
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder="E-posta"
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder="Şifre"
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity
        style={[appStyles.loginButton, { backgroundColor: theme.accent }]}
        onPress={handleLogin}
      >
        <Text style={[appStyles.loginButtonText, { color: '#fff' }]}>Giriş Yap</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 16 }} onPress={handleSkip}>
        <Text style={[appStyles.skipButtonText, { color: theme.accentDim }]}>Şimdilik Atla</Text>
      </TouchableOpacity>
    </View>
  );
};
