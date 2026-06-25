import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearProcessedToolCallsForTests,
  getStoredCartId,
  handleToolSuccess,
  loadShopifyCartStorage,
  saveShopifyCartStorage,
} from "./cart-sync";
import {
  parseCartToolPayload,
  parseCartFromAgentText,
} from "../utils/shopify-cart-parse";

const storage = new Map<string, string>();

function installLocalStorageMock() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  });
}

const SAMPLE_CART_ID =
  "gid://shopify/Cart/c1-66330c6d752c2b242bb8487474949791?key=fa8913e951098d30d68033cf6b7b50f3";
const SAMPLE_CHECKOUT_URL = "https://example.myshopify.com/cart/c/test?key=abc";

const SAMPLE_CART_JSON = JSON.stringify({
  id: SAMPLE_CART_ID,
  checkout_url: SAMPLE_CHECKOUT_URL,
  lines: [
    {
      id: "gid://shopify/CartLine/1",
      quantity: 2,
      title: "Scout Backpack",
      variant_id: "gid://shopify/ProductVariant/1",
    },
  ],
});

describe("shopify-cart-parse", () => {
  it("parses cart JSON payloads", () => {
    const snapshot = parseCartToolPayload(SAMPLE_CART_JSON);
    expect(snapshot).toEqual({
      cartId: SAMPLE_CART_ID,
      checkoutUrl: SAMPLE_CHECKOUT_URL,
      lineItems: [
        {
          id: "gid://shopify/CartLine/1",
          quantity: 2,
          title: "Scout Backpack",
          variantId: "gid://shopify/ProductVariant/1",
        },
      ],
      lineItemCount: 2,
    });
  });

  it("parses MCP content blocks", () => {
    const snapshot = parseCartToolPayload([
      {
        type: "text",
        text: SAMPLE_CART_JSON,
      },
    ]);

    expect(snapshot?.cartId).toBe(SAMPLE_CART_ID);
    expect(snapshot?.lineItemCount).toBe(2);
  });

  it("parses cart details from agent plain text", () => {
    const snapshot = parseCartFromAgentText(
      `Cart ID: ${SAMPLE_CART_ID}\nTotal Quantity: 2`
    );
    expect(snapshot?.cartId).toBe(SAMPLE_CART_ID);
    expect(snapshot?.lineItemCount).toBe(2);
  });

  it("parses Storefront API cart line edges", () => {
    const snapshot = parseCartToolPayload(
      JSON.stringify({
        id: SAMPLE_CART_ID,
        total_quantity: 3,
        lines: {
          edges: [
            {
              node: {
                quantity: 2,
                merchandise: {
                  id: "gid://shopify/ProductVariant/40123456789",
                  title: "Scout Backpack",
                },
              },
            },
            {
              node: {
                quantity: 1,
                merchandise: {
                  id: "gid://shopify/ProductVariant/40987654321",
                },
              },
            },
          ],
        },
      })
    );

    expect(snapshot).toEqual({
      cartId: SAMPLE_CART_ID,
      checkoutUrl: undefined,
      lineItems: [
        {
          id: undefined,
          quantity: 2,
          title: "Scout Backpack",
          variantId: "gid://shopify/ProductVariant/40123456789",
        },
        {
          id: undefined,
          quantity: 1,
          title: undefined,
          variantId: "gid://shopify/ProductVariant/40987654321",
        },
      ],
      lineItemCount: 3,
    });
  });
});

describe("cart-sync storage", () => {
  const scope = "test-agent:test-user";

  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
    clearProcessedToolCallsForTests();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ item_count: 2 }),
    } as Response);
  });

  it("saves a new cart id when storage is empty", () => {
    const snapshot = parseCartToolPayload(SAMPLE_CART_JSON)!;
    const { storage, cartIdChanged } = saveShopifyCartStorage(
      scope,
      snapshot,
      null
    );

    expect(storage.cartId).toBe(SAMPLE_CART_ID);
    expect(cartIdChanged).toBe(false);
    expect(getStoredCartId(scope)).toBe(SAMPLE_CART_ID);
  });

  it("updates checkout url and count without replacing the same cart id", () => {
    const snapshot = parseCartToolPayload(SAMPLE_CART_JSON)!;
    saveShopifyCartStorage(scope, snapshot, null);

    const updatedSnapshot = {
      ...snapshot,
      checkoutUrl: "https://example.myshopify.com/cart/c/updated",
      lineItemCount: 3,
    };
    const { storage, cartIdChanged } = saveShopifyCartStorage(
      scope,
      updatedSnapshot,
      loadShopifyCartStorage(scope)
    );

    expect(storage.cartId).toBe(SAMPLE_CART_ID);
    expect(storage.checkoutUrl).toBe(
      "https://example.myshopify.com/cart/c/updated"
    );
    expect(storage.lineItemCount).toBe(3);
    expect(cartIdChanged).toBe(false);
  });

  it("replaces the stored cart id when Shopify returns a different id", () => {
    const snapshot = parseCartToolPayload(SAMPLE_CART_JSON)!;
    saveShopifyCartStorage(scope, snapshot, null);

    const nextCartId =
      "gid://shopify/Cart/c1-newcartid123?key=fa8913e951098d30d68033cf6b7b50f3";
    const nextSnapshot = {
      ...snapshot,
      cartId: nextCartId,
    };
    const { storage, cartIdChanged } = saveShopifyCartStorage(
      scope,
      nextSnapshot,
      loadShopifyCartStorage(scope)
    );

    expect(storage.cartId).toBe(nextCartId);
    expect(cartIdChanged).toBe(true);
  });

  it("dedupes handleToolSuccess by tool call id", async () => {
    const first = await handleToolSuccess({
      toolName: "update_cart",
      toolCallId: "call-1",
      payload: SAMPLE_CART_JSON,
      scope,
    });
    const second = await handleToolSuccess({
      toolName: "update_cart",
      toolCallId: "call-1",
      payload: SAMPLE_CART_JSON,
      scope,
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
  });
});
