// Context → TimetableScreen prop bridge
import { TimetableScreen } from "../";
import { useTheme } from "../../context/ThemeContext";
import { useDashboard } from "../../context/DashboardContext";

export const TimetableContainer = () => {
  const { theme } = useTheme();
  const { selectedFieldId } = useDashboard();
  return <TimetableScreen theme={theme} selectedFieldId={selectedFieldId} />;
};
