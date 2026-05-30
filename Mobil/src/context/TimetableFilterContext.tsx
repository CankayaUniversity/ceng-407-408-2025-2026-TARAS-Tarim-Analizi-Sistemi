// LLM kaynakli Cizelge filtre direktifi — set_timetable_filters tool'u icin.
// TimetableScreen bu context'i dinler; gelen istegi (nonce'lu) mount aninda ya da
// canli nonce degisiminde filtre state'ine cevirir. SectionFocusContext ile ayni desen:
// nonce sayesinde ayni istek iki kez uygulanmaz, mount yarisinda da kaybolmaz.
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AggregationMode, MetricKey } from "../screens/Timetable/types";

// Backend toolExecutor.ts::TimetableFilterPayload ile birebir ayni sekil.
// Yalnizca degistirilecek alanlar bulunur; eksik alan "degistirme" demek.
// zones: [] -> tum bolgeler, [...] -> secili bolgeler, undefined -> degistirme.
// range her zaman now'dan geriye rolling — gun veya saat cinsinden.
export interface TimetableFilterPayload {
  range?: { days: number } | { hours: number };
  aggregation?: AggregationMode;
  metrics?: MetricKey[];
  zones?: string[];
  view?: "chart" | "table";
}

export interface TimetableFilterRequest extends TimetableFilterPayload {
  nonce: number;
}

interface TimetableFilterContextValue {
  filterRequest: TimetableFilterRequest | null;
  requestFilters: (payload: TimetableFilterPayload) => void;
}

const TimetableFilterContext =
  createContext<TimetableFilterContextValue | null>(null);

export const TimetableFilterProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [filterRequest, setFilterRequest] =
    useState<TimetableFilterRequest | null>(null);
  const nonceRef = useRef(0);

  const requestFilters = useCallback((payload: TimetableFilterPayload) => {
    nonceRef.current += 1;
    console.log("[FILTER] request:", JSON.stringify(payload), "#", nonceRef.current);
    setFilterRequest({ ...payload, nonce: nonceRef.current });
  }, []);

  const value = useMemo<TimetableFilterContextValue>(
    () => ({ filterRequest, requestFilters }),
    [filterRequest, requestFilters],
  );

  return (
    <TimetableFilterContext.Provider value={value}>
      {children}
    </TimetableFilterContext.Provider>
  );
};

export const useTimetableFilter = (): TimetableFilterContextValue => {
  const ctx = useContext(TimetableFilterContext);
  if (!ctx) {
    throw new Error(
      "useTimetableFilter must be used inside TimetableFilterProvider",
    );
  }
  return ctx;
};
