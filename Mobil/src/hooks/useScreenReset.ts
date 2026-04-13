// Ekran reset hook - ekran aktif/pasif olunca callback calistirir
// Params: isActive, options (onActivate, onDeactivate)

import { useEffect, useRef } from "react";

interface UseScreenResetOptions {
  onActivate?: () => void;
  onDeactivate?: () => void;
}

export const useScreenReset = (
  isActive: boolean,
  options: UseScreenResetOptions = {},
) => {
  const { onActivate, onDeactivate } = options;
  // false olarak basla — ilk mount'ta isActive=true ise onActivate tetiklensin
  const wasActive = useRef(false);
  const mountedRef = useRef(true);

  // Store callbacks in refs to avoid re-triggering effect on callback changes
  const onActivateRef = useRef(onActivate);
  const onDeactivateRef = useRef(onDeactivate);

  // Keep refs up to date
  useEffect(() => {
    onActivateRef.current = onActivate;
    onDeactivateRef.current = onDeactivate;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;

    // Navigating TO this screen (becoming active)
    if (isActive && !wasActive.current) {
      onActivateRef.current?.();
    }

    // Navigating AWAY from this screen (becoming inactive)
    if (!isActive && wasActive.current) {
      onDeactivateRef.current?.();
    }

    wasActive.current = isActive;
  }, [isActive]); // Only depend on isActive, not on callbacks
};
