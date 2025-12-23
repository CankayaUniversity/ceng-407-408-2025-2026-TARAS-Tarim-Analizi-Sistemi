import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber/native';
import { Text, View } from 'react-native';
import { ColorPlane } from '../../Plane';
import { HEADER_TEXT } from '../constants';
import { appStyles } from '../styles';

interface HomeScreenProps {
  theme: any;
  effectiveIsDark: boolean;
}

export const HomeScreen = ({ theme, effectiveIsDark }: HomeScreenProps) => {
  return (
    <>
      <View style={appStyles.header}>
        <Text style={[appStyles.headerTitle, { color: theme.accent }]}>{HEADER_TEXT.home}</Text>
        <Text style={[appStyles.headerSubtitle, { color: theme.textSecondary }]}>
          Döndürmek için sürükleyin • Rengi değiştirmek için dokunun
        </Text>
      </View>
      <View style={appStyles.spacer} />
      <View style={appStyles.canvasContainer}>
        <Canvas camera={{ position: [0, 8, 11.3], fov: 50 }} style={{ flex: 1 }}>
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane isDark={effectiveIsDark} />
          </Suspense>
        </Canvas>
      </View>
    </>
  );
};
