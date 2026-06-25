import { Signal, useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useCallback, useMemo } from "preact/hooks";
import { useContextSafely } from "../utils/useContextSafely";

export type SizeVariant = "compact" | "expanded" | "fullscreen";

interface WidgetSizeContextType {
  variant: Signal<SizeVariant>;
  toggleSize: () => void;
}

const WidgetSizeContext = createContext<WidgetSizeContextType | undefined>(
  undefined
);

interface WidgetSizeProviderProps {
  children: ComponentChildren;
  initialVariant?: SizeVariant;
}

export function WidgetSizeProvider({
  children,
}: WidgetSizeProviderProps) {
  const variant = useSignal<SizeVariant>("compact");

  const toggleSize = useCallback(() => {}, []);

  const value = useMemo(
    () => ({
      variant,
      toggleSize,
    }),
    [variant, toggleSize]
  );

  return (
    <WidgetSizeContext.Provider value={value}>
      {children}
    </WidgetSizeContext.Provider>
  );
}

export function useWidgetSize() {
  return useContextSafely(WidgetSizeContext);
}
