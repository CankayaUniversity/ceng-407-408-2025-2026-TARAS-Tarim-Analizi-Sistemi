import { View, Text } from 'react-native';
import { appStyles } from '../styles';
import { HEADER_TEXT } from '../constants';

interface TimetableScreenProps {
  theme: any;
}

export const TimetableScreen = ({ theme }: TimetableScreenProps) => {
  return (
    <View style={[appStyles.placeholder, { backgroundColor: theme.background }]}>
      <Text style={[appStyles.placeholderText, { color: theme.text }]}>{HEADER_TEXT.timetable}</Text>
      <Text style={[appStyles.placeholderSub, { color: theme.textSecondary }]}>
        İçerik yakında gelecek.
      </Text>
    </View>
  );
};
