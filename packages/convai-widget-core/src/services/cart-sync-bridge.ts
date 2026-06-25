import type { CartSyncApplyResult } from "./cart-sync";
import type { ShopifyCartSnapshot } from "../types/shopify-cart";

export type CartSyncBridge = {
  applyToolSuccess: (input: {
    toolName: string;
    toolCallId: string;
    payload: string | Record<string, unknown>[];
  }) => Promise<CartSyncApplyResult>;
  applyCartSnapshot: (input: {
    snapshot: ShopifyCartSnapshot;
    dedupeKey: string;
  }) => Promise<CartSyncApplyResult>;
  getDynamicVariables: () => Record<string, string>;
};

let cartSyncBridge: CartSyncBridge | null = null;

export function getCartSyncBridge(): CartSyncBridge | null {
  return cartSyncBridge;
}

export function setCartSyncBridge(bridge: CartSyncBridge | null) {
  cartSyncBridge = bridge;
}
