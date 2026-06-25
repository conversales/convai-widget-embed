import type {
  ShopifyCartSnapshot,
  ShopifyCartStorage,
  ShopifyCartToolName,
} from "../types/shopify-cart";
import { isShopifyCartToolName } from "../types/shopify-cart";
import { parseCartToolPayload } from "../utils/shopify-cart-parse";
import { readCartIdFromCookie } from "../utils/shopify-cart-cookie";
import { syncThemeCartFromSnapshot } from "../utils/shopify-theme-cart";

const LOG_PREFIX = "[CartSync]";
const STORAGE_PREFIX = "xi:convai-shopify-cart:";

export const SHOPIFY_CART_ID_DYNAMIC_VARIABLE = "shopify_cart_id";

export type CartSyncToolSuccessInput = {
  toolName: string;
  toolCallId: string;
  payload: string | Record<string, unknown>[];
  scope: string;
};

export type CartSyncApplyResult = {
  applied: boolean;
  storage: ShopifyCartStorage | null;
  snapshot: ShopifyCartSnapshot | null;
  cartIdChanged: boolean;
};

function getStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

function isValidStorage(value: unknown): value is ShopifyCartStorage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ShopifyCartStorage).cartId === "string" &&
    (value as ShopifyCartStorage).cartId.trim().length > 0 &&
    typeof (value as ShopifyCartStorage).lineItemCount === "number" &&
    typeof (value as ShopifyCartStorage).updatedAt === "number"
  );
}

export function loadShopifyCartStorage(
  scope: string
): ShopifyCartStorage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (isValidStorage(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Failed to read stored cart for scope ${scope}`,
      error
    );
  }

  return null;
}

export function saveShopifyCartStorage(
  scope: string,
  snapshot: ShopifyCartSnapshot,
  existing: ShopifyCartStorage | null
): { storage: ShopifyCartStorage; cartIdChanged: boolean } {
  const cartIdChanged = !!existing && existing.cartId !== snapshot.cartId;

  const storage: ShopifyCartStorage = {
    cartId: snapshot.cartId,
    checkoutUrl: snapshot.checkoutUrl ?? existing?.checkoutUrl,
    lineItemCount: snapshot.lineItemCount,
    updatedAt: Date.now(),
  };

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(getStorageKey(scope), JSON.stringify(storage));
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} Failed to persist cart for scope ${scope}`,
        error
      );
    }
  }

  return { storage, cartIdChanged };
}

export function getStoredCartId(scope: string): string | null {
  return (
    readCartIdFromCookie() ?? loadShopifyCartStorage(scope)?.cartId ?? null
  );
}

export function getDynamicVariables(scope: string): Record<string, string> {
  return {
    [SHOPIFY_CART_ID_DYNAMIC_VARIABLE]: getStoredCartId(scope) ?? "",
  };
}

export function buildCartContextualUpdate(cartId: string): string {
  return JSON.stringify({
    [SHOPIFY_CART_ID_DYNAMIC_VARIABLE]: cartId,
  });
}

export type CartSnapshotInput = {
  snapshot: ShopifyCartSnapshot;
  scope: string;
  dedupeKey: string;
};

const processedToolCalls = new Set<string>();
const processedCartSyncKeys = new Set<string>();

export function clearProcessedToolCallsForTests() {
  processedToolCalls.clear();
  processedCartSyncKeys.clear();
}

async function applyCartSnapshotToScope(
  scope: string,
  snapshot: ShopifyCartSnapshot
): Promise<CartSyncApplyResult> {
  const existing = loadShopifyCartStorage(scope);
  const { storage, cartIdChanged } = saveShopifyCartStorage(
    scope,
    snapshot,
    existing
  );

  const themeState = await syncThemeCartFromSnapshot(snapshot);
  const cartIdFromCookie = readCartIdFromCookie();
  if (cartIdFromCookie) {
    storage.cartId = cartIdFromCookie;
  }
  if (themeState && themeState.itemCount >= 0) {
    storage.lineItemCount = themeState.itemCount;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(getStorageKey(scope), JSON.stringify(storage));
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to update theme cart count`, error);
      }
    }
  }

  return {
    applied: true,
    storage,
    snapshot,
    cartIdChanged,
  };
}

export async function handleCartSnapshot(
  input: CartSnapshotInput
): Promise<CartSyncApplyResult> {
  if (processedCartSyncKeys.has(input.dedupeKey)) {
    return {
      applied: false,
      storage: null,
      snapshot: null,
      cartIdChanged: false,
    };
  }

  processedCartSyncKeys.add(input.dedupeKey);
  return applyCartSnapshotToScope(input.scope, input.snapshot);
}

export function parseCartFromToolResult(
  toolName: ShopifyCartToolName,
  payload: string | Record<string, unknown>[]
): ShopifyCartSnapshot | null {
  const snapshot = parseCartToolPayload(payload);
  if (!snapshot) {
    console.warn(`${LOG_PREFIX} Could not parse cart payload from ${toolName}`);
  }
  return snapshot;
}

export async function handleToolSuccess(
  input: CartSyncToolSuccessInput
): Promise<CartSyncApplyResult> {
  if (!isShopifyCartToolName(input.toolName)) {
    return {
      applied: false,
      storage: null,
      snapshot: null,
      cartIdChanged: false,
    };
  }

  if (processedToolCalls.has(input.toolCallId)) {
    return {
      applied: false,
      storage: null,
      snapshot: null,
      cartIdChanged: false,
    };
  }

  const snapshot = parseCartFromToolResult(input.toolName, input.payload);
  if (!snapshot) {
    return {
      applied: false,
      storage: null,
      snapshot: null,
      cartIdChanged: false,
    };
  }

  processedToolCalls.add(input.toolCallId);

  return applyCartSnapshotToScope(input.scope, snapshot);
}

export function warnMissingCartIdOnToolCall(
  scope: string,
  toolName: string,
  parameters: Record<string, unknown> | undefined
) {
  if (!isShopifyCartToolName(toolName)) {
    return;
  }

  const storedCartId = getStoredCartId(scope);
  if (!storedCartId) {
    return;
  }

  const requestedCartId =
    typeof parameters?.cart_id === "string" ? parameters.cart_id.trim() : "";
  if (!requestedCartId) {
    console.warn(
      `${LOG_PREFIX} ${toolName} called without cart_id while ${storedCartId} is stored. Ensure the agent passes {{${SHOPIFY_CART_ID_DYNAMIC_VARIABLE}}}.`
    );
  }
}
