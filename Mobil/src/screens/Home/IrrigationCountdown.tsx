// Sulama geri sayimi — HH:MM formatinda yanip sonen iki nokta ile
import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { Theme } from "../../utils/theme";
import { ms, s } from "../../utils/responsive";

const FONT_SIZE = ms(36, 0.5);
const LINE_HEIGHT = FONT_SIZE * 1.1;
const COLON_WIDTH = FONT_SIZE * 0.3;
const COLON_BLINK_MS = 1000;
const DEFAULT_TARGET_HOUR = 12;

interface IrrigationCountdownProps {
  theme: Theme;
  isoTimestamp?: string;
}

export const IrrigationCountdown = ({ theme, isoTimestamp }: IrrigationCountdownProps) => {
  const [hours, setHours] = useState("00");
  const [minutes, setMinutes] = useState("00");
  const [colonVisible, setColonVisible] = useState(true);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      let target: Date;

      if (isoTimestamp) {
        target = new Date(isoTimestamp);
      } else {
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_TARGET_HOUR);
        if (now >= target) target = new Date(target.getTime() + 86400000);
      }

      const diffMs = Math.max(0, target.getTime() - now.getTime());
      const totalMin = Math.floor(diffMs / 60000);
      setHours(String(Math.floor(totalMin / 60)).padStart(2, "0"));
      setMinutes(String(totalMin % 60).padStart(2, "0"));
    };

    compute();
    const colonInterval = setInterval(() => setColonVisible((c) => !c), COLON_BLINK_MS);

    // Dakika basinda senkronize guncelleme
    const now = new Date();
    const msToNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let minInterval: ReturnType<typeof setInterval> | null = null;
    const minTimeout = setTimeout(() => {
      compute();
      minInterval = setInterval(compute, 60000);
    }, msToNextMin);

    return () => {
      clearInterval(colonInterval);
      clearTimeout(minTimeout);
      if (minInterval) clearInterval(minInterval);
    };
  }, [isoTimestamp]);

  return (
    <View className="row">
      <Text
        className="font-normal"
        style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: theme.text }}
        numberOfLines={1}
      >
        {hours}
      </Text>
      <View
        className="center"
        style={{ width: COLON_WIDTH, marginHorizontal: s(1) }}
      >
        <Text
          className="font-normal"
          style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: theme.text, opacity: colonVisible ? 1 : 0 }}
        >
          :
        </Text>
      </View>
      <Text
        className="font-normal"
        style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: theme.text }}
        numberOfLines={1}
      >
        {minutes}
      </Text>
    </View>
  );
};
