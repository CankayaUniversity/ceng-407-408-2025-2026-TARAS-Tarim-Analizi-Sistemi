// Dashboard context — fields, secili tarla, dashboardData, refresh logic
// AuthContext'i okuyor: isLoggedIn + dataSource degisince veri yukluyor

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  dashboardAPI,
  DashboardData,
  FieldSummary,
} from "../utils/api";
import { getDemoFields, generateDemoDashboardData } from "../utils/demoData";
import { useAuth } from "./AuthContext";

interface DashboardContextValue {
  fields: FieldSummary[];
  selectedFieldId: string | null;
  dashboardData: DashboardData | null;
  refreshing: boolean;
  fieldSelectorOpen: boolean;
  selectField: (fieldId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setFieldSelectorOpen: (open: boolean) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthReady, isLoggedIn, dataSource } = useAuth();
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);

  const loadDashboardForField = useCallback(
    async (fieldId: string, isDemo: boolean) => {
      try {
        if (isDemo) {
          setDashboardData(generateDemoDashboardData(fieldId));
        } else {
          const data = await dashboardAPI.getFieldDashboard(fieldId);
          setDashboardData(data);
        }
      } catch {
        setDashboardData(generateDemoDashboardData(fieldId));
      }
    },
    [],
  );

  // isLoggedIn / dataSource degisince veri yukle
  useEffect(() => {
    if (!isAuthReady) return;
    (async () => {
      if (isLoggedIn && dataSource === "aws") {
        try {
          const fieldsData = await dashboardAPI.getFields();
          if (fieldsData && fieldsData.length > 0) {
            setFields(fieldsData);
            setSelectedFieldId(fieldsData[0].id);
            await loadDashboardForField(fieldsData[0].id, false);
            return;
          }
        } catch {
          // AWS basarisiz, demo'ya dus
        }
      }
      // Demo fallback (veya logged out)
      const demoFields = getDemoFields();
      setFields(demoFields);
      if (demoFields.length > 0) {
        setSelectedFieldId(demoFields[0].id);
        await loadDashboardForField(demoFields[0].id, true);
      }
    })();
  }, [isAuthReady, isLoggedIn, dataSource, loadDashboardForField]);

  // AppState: foreground'a gelince AWS verilerini refresh et
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && selectedFieldId && dataSource === "aws") {
        loadDashboardForField(selectedFieldId, false);
      }
    });
    return () => sub.remove();
  }, [selectedFieldId, dataSource, loadDashboardForField]);

  const selectField = useCallback(
    async (fieldId: string) => {
      setSelectedFieldId(fieldId);
      setFieldSelectorOpen(false);
      await loadDashboardForField(fieldId, dataSource === "demo");
    },
    [dataSource, loadDashboardForField],
  );

  const refresh = useCallback(async () => {
    if (!selectedFieldId) return;
    setRefreshing(true);
    await loadDashboardForField(selectedFieldId, dataSource === "demo");
    setRefreshing(false);
  }, [selectedFieldId, dataSource, loadDashboardForField]);

  const value = useMemo(
    () => ({
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      selectField,
      refresh,
      setFieldSelectorOpen,
    }),
    [
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      selectField,
      refresh,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextValue => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
};
