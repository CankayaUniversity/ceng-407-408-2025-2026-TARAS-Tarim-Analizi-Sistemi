// Asistan ikonu — eski robot kafasi, antenna yerine basinda yaprak filizi
// MaterialCommunityIcons "robot" oranlariyla ayni govde, tek fark ust kisim
// API: { size, color } tek renkli dolgu. Gozler evenodd ile delik (buton rengi gozukur)

import Svg, { Path, Rect } from "react-native-svg";

interface RobotLeafIconProps {
  size: number;
  color: string;
}

export const RobotLeafIcon = ({ size, color }: RobotLeafIconProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Govde + yan kulaklar + goz delikleri (evenodd ile bosluk) */}
      <Path
        d="M10 7 H14 a7 7 0 0 1 7 7 H22 a1 1 0 0 1 1 1 V18 a1 1 0 0 1 -1 1 H21 V20 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 V19 H2 a1 1 0 0 1 -1 -1 V15 a1 1 0 0 1 1 -1 H3 a7 7 0 0 1 7 -7 Z M5 15.5 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z M14 15.5 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z"
        fill={color}
        fillRule="evenodd"
      />
      {/* Sap */}
      <Rect x={11.1} y={4.6} width={1.8} height={2.8} rx={0.9} fill={color} />
      {/* Yaprak — saga dogru egik, belirgin */}
      <Path d="M12 6.8 C9.7 3 13 0.7 17.9 1.3 C17 5 14.6 6.8 12 6.8 Z" fill={color} />
    </Svg>
  );
};
