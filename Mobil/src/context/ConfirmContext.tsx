// Onay dialogu — imperatif useConfirm() ile cagrilir, Promise<boolean> doner.
// Native Alert.alert'in yerini alir: temali, tutarli, iki butonlu (iptal + onay).
//   const ok = await confirm({ title, message, confirmLabel, destructive: true });
//   if (!ok) return;
//
// NOT: Bir dialog acikken ikinci confirm() cagrilirsa hemen false doner (kuyruga ALINMAZ) —
// hizli arka arkaya tiklamada davranis karismasin diye. Native Alert OS tarafinda kuyruklar,
// ama burada tek-seferlik niyet daha guvenli.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Modal, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { ActionButton } from "../components/ActionButton";
import { s, vs, ms, spacing } from "../utils/responsive";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Onay butonu metni — varsayilan t.common.ok. */
  confirmLabel?: string;
  /** Iptal butonu metni — varsayilan t.common.cancel. */
  cancelLabel?: string;
  /** Onay butonu yikici renkte (kirmizi) olsun mu. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
};

interface ConfirmProviderProps {
  children: ReactNode;
}

export const ConfirmProvider = ({ children }: ConfirmProviderProps) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // Zaten acik bir dialog varsa yenisini reddet (kuyruga alma).
    if (resolverRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    resolve?.(result);
  }, []);

  const visible = opts !== null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === "android"}
        onRequestClose={() => settle(false)}
      >
        <Pressable
          onPress={() => settle(false)}
          style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.card, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.title, { color: theme.textMain }]}>{opts?.title}</Text>
            {opts?.message ? (
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {opts.message}
              </Text>
            ) : null}
            <View style={styles.buttonRow}>
              <ActionButton
                theme={theme}
                label={opts?.cancelLabel ?? t.common.cancel}
                variant="secondary"
                onPress={() => settle(false)}
              />
              <ActionButton
                theme={theme}
                label={opts?.confirmLabel ?? t.common.ok}
                variant="primary"
                onPress={() => settle(true)}
                // Yikici aksiyon: dolgulu butonu danger rengine cevir (yeni varyant acmadan).
                style={opts?.destructive ? { backgroundColor: theme.danger } : undefined}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 18,
    padding: spacing.md,
  },
  title: {
    fontSize: ms(17, 0.3),
    fontWeight: "700",
    marginBottom: vs(8),
  },
  message: {
    fontSize: ms(14, 0.3),
    lineHeight: ms(20, 0.3),
    marginBottom: vs(16),
  },
  buttonRow: {
    flexDirection: "row",
    gap: s(10),
    marginTop: vs(4),
  },
});
