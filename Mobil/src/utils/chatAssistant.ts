import { SCREEN_TYPE, ScreenType } from '../constants';

const RESPONSES: Record<string, { screen?: ScreenType; reply: string }> = {
  home: { screen: SCREEN_TYPE.HOME, reply: 'Ana Sayfa ekranına yönlendirdim. 3D düzlemi döndürebilir, rengi değiştirmek için dokunabilirsiniz.' },
  'ana sayfa': { screen: SCREEN_TYPE.HOME, reply: 'Ana Sayfa ekranına yönlendirdim. 3D düzlemi döndürebilir, rengi değiştirmek için dokunabilirsiniz.' },
  '3d': { screen: SCREEN_TYPE.HOME, reply: 'Ana Sayfa ekranına yönlendirdim. 3D düzlemi döndürebilir, rengi değiştirmek için dokunabilirsiniz.' },
  hastalık: { screen: SCREEN_TYPE.DISEASE, reply: 'Hastalık Tespiti ekranına yönlendirdim. Bitkileri taramak için kamerayı kullanabilirsiniz.' },
  disease: { screen: SCREEN_TYPE.DISEASE, reply: 'Hastalık Tespiti ekranına yönlendirdim. Bitkileri taramak için kamerayı kullanabilirsiniz.' },
  kamera: { screen: SCREEN_TYPE.DISEASE, reply: 'Hastalık Tespiti ekranına yönlendirdim. Bitkileri taramak için kamerayı kullanabilirsiniz.' },
  ayarlar: { screen: SCREEN_TYPE.SETTINGS, reply: 'Ayarlar ekranına yönlendirdim. Tema ayarlarınızı yapabilir ve çıkış yapabilirsiniz.' },
  settings: { screen: SCREEN_TYPE.SETTINGS, reply: 'Ayarlar ekranına yönlendirdim. Tema ayarlarınızı yapabilir ve çıkış yapabilirsiniz.' },
  çizelge: { screen: SCREEN_TYPE.TIMETABLE, reply: 'Çizelge ekranına yönlendirdim. Sensör verilerini buradan takip edebilirsiniz.' },
  timetable: { screen: SCREEN_TYPE.TIMETABLE, reply: 'Çizelge ekranına yönlendirdim. Sensör verilerini buradan takip edebilirsiniz.' },
};

export const getAssistantResponse = (userInput: string, setScreen: (screen: ScreenType) => void): string => {
  const input = userInput.toLowerCase();

  for (const [key, value] of Object.entries(RESPONSES)) {
    if (input.includes(key)) {
      if (value.screen) setScreen(value.screen);
      return value.reply;
    }
  }

  if (input.includes('nasıl') || input.includes('how')) {
    return 'TarasMobil, tarım için dijital ikiz platformudur. Ana Sayfada 3D modeli inceleyebilir, Hastalık Tespitinde bitkileri tarayabilir, Çizelgede sensör verilerini takip edebilir ve Ayarlarda tercihlerinizi yönetebilirsiniz.';
  }

  return `"${userInput}" hakkında yardımcı olabilirim. Ana Sayfa, Hastalık Tespiti, Çizelge veya Ayarlar hakkında sormak ister misiniz?`;
};
