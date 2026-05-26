// Dashboard context — farms, fields, secili farm/tarla, dashboardData, refresh logic
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  dashboardAPI,
  gatewayAPI,
  DashboardData,
  FieldSummary,
  ERR_AUTH_EXPIRED,
  ERR_UNAUTHENTICATED,
} from "../utils/api";
import { getDemoFields, generateDemoDashboardData } from "../utils/demo/demoData";
import { useAuth } from "./AuthContext";

const SELECTED_FARM_KEY = "selected_farm_id";

export interface FarmInfo {
  farm_id: string;
  name: string;
}

interface DashboardContextValue {
  // Farm
  farms: FarmInfo[];
  selectedFarmId: string | null;
  selectedFarm: FarmInfo | null;
  setSelectedFarmId: (farmId: string) => void;
  // Fields
  fields: FieldSummary[];
  selectedFieldId: string | null;
  dashboardData: DashboardData | null;
  refreshing: boolean;
  fieldSelectorOpen: boolean;
  addFieldModalOpen: boolean;
  initialLoadDone: boolean;
  hasFarms: boolean;
  selectField: (fieldId: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshFields: (selectFieldId?: string) => Promise<void>;
  setFieldSelectorOpen: (open: boolean) => void;
  setAddFieldModalOpen: (open: boolean) => void;
  addLocalField: (summary: FieldSummary, data: DashboardData) => void;
  notifyFarmCreated: (farmId: string) => Promise<void>;
  deleteFarm: (farmId: string) => Promise<void>;
  deleteField: (fieldId: string) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthReady, isLoggedIn, dataSource, handleLogout } = useAuth();

  // Farm state
  const [farms, setFarms] = useState<FarmInfo[]>([]);
  const [selectedFarmId, setSelectedFarmIdRaw] = useState<string | null>(null);

  // Field / dashboard state
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);
  const [addFieldModalOpen, setAddFieldModalOpen] = useState(false);
  const [localFields] = useState(() => new Map<string, DashboardData>());
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [hasFarms, setHasFarms] = useState(false);

  const selectedFarm = useMemo(
    () => farms.find((f) => f.farm_id === selectedFarmId) ?? null,
    [farms, selectedFarmId],
  );

  // ── Dashboard yükleme ──────────────────────────────────────────────────────
  const loadDashboardForField = useCallback(
    async (fieldId: string, isDemo: boolean) => {
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
      }
    },
    [handleLogout, localFields],
  );

  // ── Secili farm'a gore field'lari yukle ────────────────────────────────────
  const loadFieldsForFarm = useCallback(
    async (farmId: string | null, isDemo: boolean) => {
      if (isDemo) {
        const demoFields = getDemoFields();
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

      try {
        const raw = await dashboardAPI.getFields(farmId ?? undefined);
        // Sadece secili farm'a ait field'lari goster
        const fieldsData = farmId ? raw.filter((f) => f.farm_id === farmId) : raw;
        setFields(fieldsData);
        if (fieldsData.length > 0) {
          setSelectedFieldId(fieldsData[0].id);
          await loadDashboardForField(fieldsData[0].id, false);
        } else {
          setSelectedFieldId(null);
          setDashboardData(null);
        }
      } catch (err: any) {
        const msg = err?.message ?? "";
        if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
          await handleLogout();
          return;
        }
        console.log("[DASHBOARD] loadFieldsForFarm fail:", msg);
      }
    },
    [loadDashboardForField, handleLogout],
  );

  // ── Persist + set selectedFarmId ───────────────────────────────────────────
  const setSelectedFarmId = useCallback(
    (farmId: string) => {
      setSelectedFarmIdRaw(farmId);
      AsyncStorage.setItem(SELECTED_FARM_KEY, farmId).catch(() => {});
      // Farm degisince field'lari yeniden yukle
      setFields([]);
      setSelectedFieldId(null);
      setDashboardData(null);
      loadFieldsForFarm(farmId, dataSource === "demo");
    },
    [dataSource, loadFieldsForFarm],
  );

  // ── Initial load: farms → selectedFarm → fields → dashboard ───────────────
  useEffect(() => {
    if (!isAuthReady) return;

    let cancelled = false;
    (async () => {
      if (dataSource === "demo") {
        const demoFarms: FarmInfo[] = [{ farm_id: "demo-farm", name: "Demo Çiftliği" }];
        if (cancelled) return;
        setFarms(demoFarms);
        setHasFarms(true);
        setSelectedFarmIdRaw(demoFarms[0].farm_id);
        const demoFields = getDemoFields();
        setFields(demoFields);
        if (demoFields.length > 0) {
          setSelectedFieldId(demoFields[0].id);
          await loadDashboardForField(demoFields[0].id, true);
        } else {
          setSelectedFieldId(null);
          setDashboardData(null);
        }
        setInitialLoadDone(true);
        return;
      }

      if (isLoggedIn && dataSource === "aws") {
        setFields([]);
        setSelectedFieldId(null);
        setDashboardData(null);
        setHasFarms(false);
        setFarms([]);
        setSelectedFarmIdRaw(null);
        setInitialLoadDone(false);
        try {
          // 1. Farm'ları çek
          const farmsRes = await gatewayAPI.getFarms();
          if (cancelled) return;
          const farmList: FarmInfo[] =
            farmsRes.success && farmsRes.data ? farmsRes.data : [];
          setFarms(farmList);
          const userHasFarms = farmList.length > 0;
          setHasFarms(userHasFarms);

          if (!userHasFarms) {
            setInitialLoadDone(true);
            return;
          }

          // 2. Kayıtlı farm'ı yükle veya ilk farm'ı seç
          let farmId: string;
          const storedFarmId = await AsyncStorage.getItem(SELECTED_FARM_KEY);
          if (storedFarmId && farmList.some((f) => f.farm_id === storedFarmId)) {
            farmId = storedFarmId;
          } else {
            farmId = farmList[0].farm_id;
            AsyncStorage.setItem(SELECTED_FARM_KEY, farmId).catch(() => {});
          }
          if (cancelled) return;
          setSelectedFarmIdRaw(farmId);

          // 3. Seçili farm'ın field'larını yükle
          const rawFields = await dashboardAPI.getFields(farmId);
          if (cancelled) return;
          const fieldsData = rawFields.filter((f) => f.farm_id === farmId);
          setFields(fieldsData);
          if (fieldsData.length > 0) {
            setSelectedFieldId(fieldsData[0].id);
            await loadDashboardForField(fieldsData[0].id, false);
          }
          setInitialLoadDone(true);
        } catch (err: any) {
          if (cancelled) return;
          const msg = err?.message ?? "";
          if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
            console.log("[DASHBOARD] init auth expired, logout");
            await handleLogout();
            return;
          }
          console.log("[DASHBOARD] init fail:", msg);
          setInitialLoadDone(true);
        }
        return;
      }

      // Logged out
      setFields([]);
      setSelectedFieldId(null);
      setDashboardData(null);
      setFarms([]);
      setSelectedFarmIdRaw(null);
      setHasFarms(false);
      setInitialLoadDone(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, isLoggedIn, dataSource, loadDashboardForField, handleLogout]);

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

  const refreshFields = useCallback(
    async (selectFieldId?: string) => {
      if (dataSource === "demo") return;
      try {
        const raw = await dashboardAPI.getFields(selectedFarmId ?? undefined);
        const fieldsData = selectedFarmId ? raw.filter((f) => f.farm_id === selectedFarmId) : raw;
        setFields(fieldsData);
        const targetId = selectFieldId || selectedFieldId;
        if (targetId && fieldsData.some((f) => f.id === targetId)) {
          setSelectedFieldId(targetId);
          await loadDashboardForField(targetId, false);
        } else if (fieldsData.length > 0) {
          setSelectedFieldId(fieldsData[0].id);
          await loadDashboardForField(fieldsData[0].id, false);
        }
        setAddFieldModalOpen(false);
      } catch (err: any) {
        const msg = err?.message ?? "";
        if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
          await handleLogout();
        }
      }
    },
    [dataSource, selectedFieldId, selectedFarmId, loadDashboardForField, handleLogout],
  );

  const deleteFarm = useCallback(async (farmId: string) => {
    try {
      await dashboardAPI.deleteFarm(farmId);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
        await handleLogout();
        return;
      }
      throw err;
    }
    // Local state'i guncelle
    setFarms((prev) => {
      const next = prev.filter((f) => f.farm_id !== farmId);
      if (selectedFarmId === farmId) {
        const nextFarm = next[0] ?? null;
        const nextId = nextFarm?.farm_id ?? null;
        setSelectedFarmIdRaw(nextId);
        if (nextId) {
          AsyncStorage.setItem(SELECTED_FARM_KEY, nextId).catch(() => {});
          loadFieldsForFarm(nextId, dataSource === "demo");
        } else {
          setFields([]);
          setSelectedFieldId(null);
          setDashboardData(null);
          setHasFarms(false);
        }
      }
      return next;
    });
  }, [selectedFarmId, dataSource, loadFieldsForFarm, handleLogout]);

  const deleteField = useCallback(async (fieldId: string) => {
    try {
      await dashboardAPI.deleteField(fieldId);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg === ERR_AUTH_EXPIRED || msg === ERR_UNAUTHENTICATED) {
        await handleLogout();
        return;
      }
      throw err;
    }
    setFields((prev) => {
      const next = prev.filter((f) => f.id !== fieldId);
      if (selectedFieldId === fieldId) {
        const nextField = next[0] ?? null;
        setSelectedFieldId(nextField?.id ?? null);
        if (nextField) {
          loadDashboardForField(nextField.id, dataSource === "demo");
        } else {
          setDashboardData(null);
        }
      }
      return next;
    });
  }, [selectedFieldId, dataSource, loadDashboardForField, handleLogout]);

  const notifyFarmCreated = useCallback(async (farmId: string) => {
    // Yeni farm'ı seç
    setSelectedFarmIdRaw(farmId);
    AsyncStorage.setItem(SELECTED_FARM_KEY, farmId).catch(() => {});
    // Yeni farm bos — field yok
    setFields([]);
    setSelectedFieldId(null);
    setDashboardData(null);
    setHasFarms(true);
    // Farm listesini arka planda yenile
    try {
      const farmsRes = await gatewayAPI.getFarms();
      if (farmsRes.success && farmsRes.data) {
        setFarms(farmsRes.data);
      }
    } catch { /* noop */ }
  }, []);

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
      farms,
      selectedFarmId,
      selectedFarm,
      setSelectedFarmId,
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      addFieldModalOpen,
      initialLoadDone,
      hasFarms,
      selectField,
      refresh,
      refreshFields,
      setFieldSelectorOpen,
      setAddFieldModalOpen,
      addLocalField,
      notifyFarmCreated,
      deleteFarm,
      deleteField,
    }),
    [
      farms,
      selectedFarmId,
      selectedFarm,
      setSelectedFarmId,
      fields,
      selectedFieldId,
      dashboardData,
      refreshing,
      fieldSelectorOpen,
      addFieldModalOpen,
      initialLoadDone,
      hasFarms,
      selectField,
      refresh,
      refreshFields,
      addLocalField,
      notifyFarmCreated,
      deleteFarm,
      deleteField,
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
