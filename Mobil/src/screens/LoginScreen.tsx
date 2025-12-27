import { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { appStyles } from '../styles';
import { authAPI } from '../utils/api';

// Added SVG logo imports (make sure these files exist in your assets)
import LogoLight from '../../assets/Taras-logo-light.svg';
import LogoDark from '../../assets/Taras-logo-dark.svg';

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

  // small helper to detect darkness from hex background if theme.isDark isn't provided
  const isColorDark = (hex?: string) => {
    if (!hex || typeof hex !== 'string') return false;
    const h = hex.replace('#', '').trim();
    if (![3, 6].includes(h.length)) return false;
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  };

  const isDarkMode = (theme as any).isDark ?? isColorDark(theme.background);
  const Logo = isDarkMode ? LogoLight : LogoDark;

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
      {/* SVG logo - adaptive to light/dark mode */}
      <View style={{ marginBottom: 24 }}>
        <Logo width={80} height={80} />
      </View>

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
