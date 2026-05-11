// Context → CarbonFootprintScreen prop bridge
import { CarbonFootprintScreen } from "../";
import { useTheme } from "../../context/ThemeContext";

export const CarbonFootprintContainer = () => {
  const { theme } = useTheme();
  return <CarbonFootprintScreen theme={theme} />;
};
