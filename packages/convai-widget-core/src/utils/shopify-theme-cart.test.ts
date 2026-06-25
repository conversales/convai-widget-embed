import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addVariantToThemeCart,
  syncThemeCartFromSnapshot,
} from "./shopify-theme-cart";

const SAMPLE_CART_ID =
  "gid://shopify/Cart/c1-66330c6d752c2b242bb8487474949791?key=fa8913e951098d30d68033cf6b7b50f3";

describe("shopify-theme-cart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("window", {
      location: { hostname: "example.myshopify.com" },
      dispatchEvent: vi.fn(),
      publish: vi.fn(),
      PUB_SUB_EVENTS: { cartUpdate: "cart-update" },
    });
    vi.stubGlobal("document", {
      querySelector: () => ({}),
      dispatchEvent: vi.fn(),
      getElementById: () => null,
      cookie: "",
    });
  });

  it("adds items incrementally without clearing the cart", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ item_count: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ item_count: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item_count: 2,
          token: "c1-test?key=abc",
          sections: {
            "cart-icon-bubble":
              '<div id="shopify-section-cart-icon-bubble">2</div>',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item_count: 2,
          token: "c1-test?key=abc",
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await syncThemeCartFromSnapshot({
      cartId: SAMPLE_CART_ID,
      lineItemCount: 2,
      lineItems: [
        {
          quantity: 2,
          variantId: "gid://shopify/ProductVariant/1",
        },
      ],
    });

    expect(result).toEqual({ itemCount: 2 });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/cart/clear.js",
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/?\?sections=/),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/cart/add.js",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          '"sections":"cart-drawer,cart-icon-bubble'
        ),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/cart/add.js",
      expect.objectContaining({
        body: expect.stringContaining('"sections_url":"/cart"'),
      })
    );
  });

  it("skips ajax add when the theme cart already matches", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ item_count: 1, token: "c1-test?key=abc" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await syncThemeCartFromSnapshot({
      cartId: SAMPLE_CART_ID,
      lineItemCount: 1,
      lineItems: [
        {
          quantity: 1,
          variantId: "gid://shopify/ProductVariant/99",
        },
      ],
    });

    expect(result).toEqual({ itemCount: 1 });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/cart/add.js",
      expect.anything()
    );
  });

  it("does not call cart APIs on localhost", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      dispatchEvent: vi.fn(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await addVariantToThemeCart(
      "gid://shopify/ProductVariant/1",
      1
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipped Shopify theme cart API")
    );
  });
});
