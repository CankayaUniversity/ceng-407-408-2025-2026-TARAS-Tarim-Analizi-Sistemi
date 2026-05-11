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
  ERR_AUTH_EXPIRED,
  ERR_UNAUTHENTICATED,
} from "../utils/api";
import { getDemoFields, generateDemoDashboardData } from "../utils/demo/demoData";
import { useAuth } from "./AuthContext";

interface DashboardContextValue {
  fields: FieldSummary[];
  selectedFieldId: string | null;
  dashboardData: DashboardData | null;
  refreshing: boolean;
  fieldSelectorOpen: boolean;
  addFieldModalOpen: boolean;
  selectField: (fieldId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setFieldSelectorOpen: (open: boolean) => void;
  setAddFieldModalOpen: (open: boolean) => void;
  addLocalField: (summary: FieldSummary, data: DashboardData) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthReady, isLoggedIn, dataSource, handleLogout } = useAuth();
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);
  const [addFieldModalOpen, setAddFieldModalOpen] = useState(false);
  const [localFields] = useState(() => new Map<string, DashboardData>());

  // Auth hatalarini logout'a cevirir. Diger hatalarda mevcut datayi BOZMAZ —
  // bir refresh basarisiz olursa user son bilinen iyi datayi gormeye devam eder
  // (eskiden silently demo'ya dusuyordu, real ve demo veri karisiyordu).
  const loadDashboardForField = useCallback(
    async (fieldId: string, isDemo: boolean) => {
      // Lokal olusturulmus tarla varsa ondan yukle (backend'e gitmeden)
      const localData = localFields.get(fieldId);
      if (localData) {
        setDashboardData(localData);
        return;
      }

      if (isDemo) {
        setDashboardData(generateDemoDashboardData(fieldId));
        return;
      }
      try {
        const data = await dashboardAPI.getFieldDashboard(fieldId);
        setDashboardData(data);
      } catch (err: any) {
        const msg = err?.message ?? "";
        if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
          console.log("[DASHBOARD] auth expired, logout");
          await handleLogout();
          return;
        }
        console.log("[DASHBOARD] load fail:", msg);
        // Network hatasi: stale datayi koru. Initial load'sa zaten null kalir,
        // UI spinner gosterir. Mid-session hatasi olursa son data kalir.
      }
    },
    [handleLogout, localFields],
  );

  // isLoggedIn / dataSource degisince veri yukle. Mode gecisinde stale datayi
  // (eski user'in datasi, demo'dan kalan, vb.) anlik olarak temizleriz —
  // boylece HomeScreen UI bir an icin yanlis polygon goremez.
  useEffect(() => {
    if (!isAuthReady) return;

    let cancelled = false;
    (async () => {
      if (dataSource === "demo") {
        // Demo modu: explicit demo (skip-login veya demo user). Demo data dogru.
        const demoFields = getDemoFields();
        if (cancelled) return;
        setFields(demoFields);
        if (demoFields.length > 0) {
          setSelectedFieldId(demoFields[0].id);
          await loadDashboardForField(demoFields[0].id, true);
        } else {
          setSelectedFieldId(null);
          setDashboardData(null);
        }
        return;
      }

      if (isLoggedIn && dataSource === "aws") {
        // Gercek user: ASLA demo'ya dusme. Yeni state'i fetch'ten once
        // temizle ki "demo polygon → real polygon" gecisi olmasin.
        setFields([]);
        setSelectedFieldId(null);
        setDashboardData(null);
        try {
          const fieldsData = await dashboardAPI.getFields();
          if (cancelled) return;
          if (fieldsData && fieldsData.length > 0) {
            setFields(fieldsData);
            setSelectedFieldId(fieldsData[0].id);
            await loadDashboardForField(fieldsData[0].id, false);
          }
          // 0 field: kullanicinin tarlasi yok — fields=[], data=null. UI spinner.
        } catch (err: any) {
          if (cancelled) return;
          const msg = err?.message ?? "";
          if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
            console.log("[DASHBOARD] init auth expired, logout");
            await handleLogout();
            return;
          }
          console.log("[DASHBOARD] init fail:", msg);
          // Network hatasi: state bos kalir, UI spinner gosterir, user
          // pull-to-refresh ile yeniden deneyebilir.
        }
        return;
      }

      // Logged out: state'i temizle (defensive)
      setFields([]);
      setSelectedFieldId(null);
      setDashboardData(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, isLoggedIn, dataSource, loadDashboardForField, handleLogout]);

  // AppState: foreground'a gelince AWS verilerini refresh et. Hata olursa
  // mevcut data korunur (loadDashboardForField icindeki defansif catch).
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

  // Lokal tarla ekle — frontend-only, session boyunca gecerli
  const addLocalField = useCallback(
    (summary: FieldSummary, data: DashboardData) => {
      localFields.set(summary.id, data);
      setFields((prev) => [...prev, summary]);
      setSelectedFieldId(summary.id);
      setDashboardData(data);
      setFieldSelectorOpen(false);
      setAddFieldModalOpen(false);
    },
    [localFields],
  );

  const value = useMemo(
    () => ({
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      addFieldModalOpen,
      selectField,
      refresh,
      setFieldSelectorOpen,
      setAddFieldModalOpen,
      addLocalField,
    }),
    [
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      addFieldModalOpen,
      selectField,
      refresh,
      addLocalField,
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
