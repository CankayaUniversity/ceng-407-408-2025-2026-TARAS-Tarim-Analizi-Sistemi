// Tab pop-out registry — screens register a card-button that the tab bar
// renders absolutely positioned over their tab slot. Lets buttons "pop out"
// of the tab bar without any device-specific Y/insets math: positioning is
// driven by the tab bar's own flex layout, so 3-button vs gesture nav, iOS
// home indicator, and font-scale variants all align automatically.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface TabBarPopOut {
  tabId: string;
  render: () => ReactNode;
}

interface TabBarPopOutCtx {
  popOuts: Record<string, () => ReactNode>;
  register: (popOut: TabBarPopOut) => () => void;
}

const Ctx = createContext<TabBarPopOutCtx>({
  popOuts: {},
  register: () => () => {},
});

export const TabBarPopOutProvider = ({ children }: { children: ReactNode }) => {
  const [popOuts, setPopOuts] = useState<Record<string, () => ReactNode>>({});

  const register = useCallback((popOut: TabBarPopOut) => {
    setPopOuts((cur) => ({ ...cur, [popOut.tabId]: popOut.render }));
    return () => {
      setPopOuts((cur) => {
        const { [popOut.tabId]: _gone, ...rest } = cur;
        return rest;
      });
    };
  }, []);

  return <Ctx.Provider value={{ popOuts, register }}>{children}</Ctx.Provider>;
};

export const useTabBarPopOut = () => useContext(Ctx);
