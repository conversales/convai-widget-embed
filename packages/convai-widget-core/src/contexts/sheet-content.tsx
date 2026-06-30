import { type Signal, useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { createContext } from "preact/compat";
import { useCallback, useMemo } from "preact/hooks";

import type { ProductCardData } from "../types/product-card";
import { useContextSafely } from "../utils/useContextSafely";

type SheetContentType = "transcript" | "feedback" | "history";

export interface PageConfig {
  showHeaderBack: boolean;
  onHeaderBack?: () => void;
}

const SheetContentContext = createContext<{
  currentContent: Signal<SheetContentType>;
  currentConfig: PageConfig;
  historyDetailOpen: Signal<boolean>;
  activeProduct: Signal<ProductCardData | null>;
  openProductDetail: (product: ProductCardData) => void;
  closeProductDetail: () => void;
} | null>(null);

export function SheetContentProvider({
  defaultContent = "transcript",
  children,
}: {
  defaultContent?: SheetContentType;
  children: ComponentChildren;
}) {
  const currentContent = useSignal<SheetContentType>(defaultContent);
  const historyDetailOpen = useSignal(false);
  const activeProduct = useSignal<ProductCardData | null>(null);

  const closeProductDetail = useCallback(() => {
    activeProduct.value = null;
  }, []);

  const openProductDetail = useCallback((product: ProductCardData) => {
    activeProduct.value = product;
  }, []);

  const value = useMemo(() => {
    const contentType = currentContent.value;

    const currentConfig: PageConfig =
      contentType === "feedback"
        ? {
            showHeaderBack: true,
            onHeaderBack: () => {
              currentContent.value = "transcript";
            },
          }
        : contentType === "history"
          ? {
              showHeaderBack: true,
              onHeaderBack: () => {
                if (historyDetailOpen.value) {
                  historyDetailOpen.value = false;
                } else {
                  currentContent.value = "transcript";
                }
              },
            }
          : {
              showHeaderBack: false,
            };

    return {
      currentContent,
      currentConfig,
      historyDetailOpen,
      activeProduct,
      openProductDetail,
      closeProductDetail,
    };
  }, [
    currentContent.value,
    historyDetailOpen.value,
    activeProduct.value,
    closeProductDetail,
  ]);

  return (
    <SheetContentContext.Provider value={value}>
      {children}
    </SheetContentContext.Provider>
  );
}

export function useSheetContent() {
  return useContextSafely(SheetContentContext);
}
