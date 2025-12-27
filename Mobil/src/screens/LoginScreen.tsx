import { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appStyles } from '../styles';
import { authAPI } from '../utils/api';

interface LoginScreenProps {
  theme: any;
  onLoginSuccess: () => void;
  onSkip: () => void;
}

export const LoginScreen = ({ theme, onLoginSuccess, onSkip }: LoginScreenProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hata', 'Lütfen e-posta ve şifre giriniz.');
      return;
    }

    setIsLoading(true);
    const response = await authAPI.login(email.trim(), password);
    setIsLoading(false);

    if (response.success) {
      Alert.alert('Başarılı', `Hoş geldiniz, ${response.data?.user.username}!`);
      setEmail('');
      setPassword('');
      onLoginSuccess();
    } else {
      Alert.alert('Giriş Başarısız', response.error || 'Kullanıcı adı/e-posta veya şifre hatalı.');
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurunuz.');
      return;
    }

    setIsLoading(true);
    const response = await authAPI.register(username.trim(), email.trim(), password);
    setIsLoading(false);

    if (response.success) {
      Alert.alert('Başarılı', `Hesabınız oluşturuldu, hoş geldiniz ${response.data?.user.username}!`);
      setEmail('');
      setPassword('');
      setUsername('');
      onLoginSuccess();
    } else {
      Alert.alert('Kayıt Başarısız', response.error || 'Kayıt işlemi başarısız oldu.');
    }
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
      
      {isRegisterMode && (
        <TextInput
          style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
          placeholder="Kullanıcı Adı"
          placeholderTextColor={theme.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!isLoading}
        />
      )}
      
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder={isRegisterMode ? "E-posta" : "E-posta veya Kullanıcı Adı"}
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!isLoading}
      />
      <TextInput
        style={[appStyles.loginInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.accentDim }]}
        placeholder="Şifre"
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!isLoading}
      />
      <TouchableOpacity
        style={[
          appStyles.loginButton,
          { backgroundColor: theme.accent },
          isLoading && { opacity: 0.6 }
        ]}
        onPress={isRegisterMode ? handleRegister : handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[appStyles.loginButtonText, { color: '#fff' }]}>
            {isRegisterMode ? 'Kayıt Ol' : 'Giriş Yap'}
          </Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={{ marginTop: 16 }} 
        onPress={() => setIsRegisterMode(!isRegisterMode)}
        disabled={isLoading}
      >
        <Text style={[appStyles.skipButtonText, { color: theme.accent }]}>
          {isRegisterMode ? 'Zaten hesabınız var mı? Giriş Yap' : 'Hesabınız yok mu? Kayıt Ol'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={{ marginTop: 8 }} 
        onPress={handleSkip}
        disabled={isLoading}
      >
        <Text style={[appStyles.skipButtonText, { color: theme.accentDim }]}>Şimdilik Atla</Text>
      </TouchableOpacity>
    </View>
  );
};
