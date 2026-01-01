import { Text, View } from 'react-native';
import { Theme } from '../utils/theme';

interface CarbonFootprintScreenProps {
  theme: Theme;
}

export const CarbonFootprintScreen = ({ theme }: CarbonFootprintScreenProps) => {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
      <Text style={{ fontSize: 24, color: theme.text, fontWeight: '600' }}>
        Karbon Ayak İzi
      </Text>
      <Text style={{ fontSize: 16, color: theme.textSecondary, marginTop: 12 }}>
        Yakında...
      </Text>
    </View>
  );
};
