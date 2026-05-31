// Sekme sifirlama — aktif sekmenin butonuna tekrar basilinca o sekmeyi "ana
// duruma" dondurur (alt ekrandan koke don, acik modallari kapat, en uste kaydir).
// AppTabBar requestReset(tab) cagirir; ilgili container/ekran useTabReset(tab, cb)
// ile dinler. Her sekme icin artan bir nonce tutulur — degisince cb tetiklenir.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TabParamList } from "../navigation/navigationRef";

export type TabId = keyof TabParamList;

interface TabResetContextValue {
  signals: Record<string, number>;
  requestReset: (tab: TabId) => void;
}

const TabResetContext = createContext<TabResetContextValue | null>(null);

export const TabResetProvider = ({ children }: { children: React.ReactNode }) => {
  const [signals, setSignals] = useState<Record<string, number>>({});

  const requestReset = useCallback((tab: TabId) => {
    setSignals((prev) => ({ ...prev, [tab]: (prev[tab] ?? 0) + 1 }));
  }, []);

  const value = useMemo<TabResetContextValue>(
    () => ({ signals, requestReset }),
    [signals, requestReset],
  );

  return <TabResetContext.Provider value={value}>{children}</TabResetContext.Provider>;
};

export const useTabResetContext = (): TabResetContextValue => {
  const ctx = useContext(TabResetContext);
  if (!ctx) throw new Error("useTabResetContext must be used inside TabResetProvider");
  return ctx;
};

// Verilen sekmenin sifirlama sinyali ARTTIGINDA cb'yi calistirir (mount'ta degil).
// cb ref'te tutulur — surekli degisen closure'lar effect'i gereksiz tetiklemesin.
export const useTabReset = (tab: TabId, cb: () => void): void => {
  const { signals } = useTabResetContext();
  const sig = signals[tab] ?? 0;
  const prevSig = useRef(sig);
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    if (sig !== prevSig.current) {
      prevSig.current = sig;
      cbRef.current();
    }
  }, [sig]);
};
