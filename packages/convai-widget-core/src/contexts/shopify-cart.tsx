import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { createContext, useEffect, useMemo, useRef } from "preact/compat";
import { useSignalEffect } from "@preact/signals";
import { useContextSafely } from "../utils/useContextSafely";
import { useWidgetStorageScope } from "../hooks/useWidgetStorageScope";
import { useConversation } from "./conversation";
import {
  buildCartContextualUpdate,
  getDynamicVariables,
  handleCartSnapshot,
  handleToolSuccess,
  loadShopifyCartStorage,
} from "../services/cart-sync";
import {
  getCartSyncBridge,
  setCartSyncBridge,
  type CartSyncBridge,
} from "../services/cart-sync-bridge";
import { isShopifyCartToolName } from "../types/shopify-cart";
import type { ShopifyCartStorage } from "../types/shopify-cart";
import { parseCartFromAgentText } from "../utils/shopify-cart-parse";

export type { CartSyncBridge };
export { getCartSyncBridge, setCartSyncBridge };

type ShopifyCartSetup = ReturnType<typeof useShopifyCartSetup>;

const ShopifyCartContext = createContext<ShopifyCartSetup | null>(null);

function useShopifyCartSetup(scope: string) {
  const cartId = signal<string | null>(null);
  const checkoutUrl = signal<string | null>(null);
  const lineItemCount = signal(0);
  const lastSyncedAt = signal<number | null>(null);

  const applyStorage = (storage: ShopifyCartStorage | null) => {
    cartId.value = storage?.cartId ?? null;
    checkoutUrl.value = storage?.checkoutUrl ?? null;
    lineItemCount.value = storage?.lineItemCount ?? 0;
    lastSyncedAt.value = storage?.updatedAt ?? null;
  };

  const restoreFromStorage = () => {
    applyStorage(loadShopifyCartStorage(scope));
  };

  return {
    cartId,
    checkoutUrl,
    lineItemCount,
    lastSyncedAt,
    restoreFromStorage,
    applyStorage,
  };
}

interface ShopifyCartProviderProps {
  children: ComponentChildren;
}

export function ShopifyCartProvider({ children }: ShopifyCartProviderProps) {
  const sessionScope = useWidgetStorageScope();
  const { sendContextualUpdate } = useConversation();
  const value = useMemo(
    () => useShopifyCartSetup(sessionScope.value),
    [sessionScope.value]
  );
  const sendContextualUpdateRef = useRef(sendContextualUpdate);

  useEffect(() => {
    sendContextualUpdateRef.current = sendContextualUpdate;
  }, [sendContextualUpdate]);

  useEffect(() => {
    value.restoreFromStorage();
  }, [sessionScope.value, value]);

  useEffect(() => {
    const bridge: CartSyncBridge = {
      applyToolSuccess: async input => {
        const hadStoredCart = !!loadShopifyCartStorage(sessionScope.peek());
        const result = await handleToolSuccess({
          ...input,
          scope: sessionScope.peek(),
        });

        if (result.applied && result.storage) {
          value.applyStorage(result.storage);
          if (!hadStoredCart || result.cartIdChanged) {
            sendContextualUpdateRef.current(
              buildCartContextualUpdate(result.storage.cartId)
            );
          }
        }

        return result;
      },
      applyCartSnapshot: async input => {
        const hadStoredCart = !!loadShopifyCartStorage(sessionScope.peek());
        const result = await handleCartSnapshot({
          ...input,
          scope: sessionScope.peek(),
        });

        if (result.applied && result.storage) {
          value.applyStorage(result.storage);
          if (!hadStoredCart || result.cartIdChanged) {
            sendContextualUpdateRef.current(
              buildCartContextualUpdate(result.storage.cartId)
            );
          }
        }

        return result;
      },
      getDynamicVariables: () => getDynamicVariables(sessionScope.peek()),
    };

    setCartSyncBridge(bridge);
    return () => {
      setCartSyncBridge(null);
    };
  }, [sessionScope, value]);

  return (
    <ShopifyCartContext.Provider value={value}>
      {children}
    </ShopifyCartContext.Provider>
  );
}

export function useShopifyCart() {
  return useContextSafely(ShopifyCartContext);
}

export function CartSyncWatcher() {
  const sessionScope = useWidgetStorageScope();
  const { transcript } = useConversation();
  const processedResponseKeys = useRef(new Set<string>());

  useSignalEffect(() => {
    sessionScope.value;
    processedResponseKeys.current.clear();
    const bridge = getCartSyncBridge();
    bridge?.getDynamicVariables();
  });

  useSignalEffect(() => {
    const entries = transcript.value;
    const bridge = getCartSyncBridge();
    if (!bridge) {
      return;
    }

    for (const entry of entries) {
      if (entry.type === "message" && entry.role === "agent" && !entry.isStreaming) {
        const snapshot = parseCartFromAgentText(entry.message);
        if (snapshot) {
          const key = `agent-msg:${entry.conversationIndex}:${entry.eventId ?? snapshot.cartId}`;
          if (processedResponseKeys.current.has(key)) {
            continue;
          }
          processedResponseKeys.current.add(key);
          void bridge.applyCartSnapshot({ snapshot, dedupeKey: key });
        }
      }

      if (entry.type === "agent_tool_response") {
        const key = `${entry.toolCallId}:${entry.eventId}`;
        if (processedResponseKeys.current.has(key)) {
          continue;
        }

        if (
          entry.toolName &&
          isShopifyCartToolName(entry.toolName) &&
          !entry.isError &&
          entry.fullToolResult
        ) {
          processedResponseKeys.current.add(key);
          void bridge.applyToolSuccess({
            toolName: entry.toolName,
            toolCallId: entry.toolCallId,
            payload: entry.fullToolResult,
          });
        }
      }
    }
  });

  return null;
}
