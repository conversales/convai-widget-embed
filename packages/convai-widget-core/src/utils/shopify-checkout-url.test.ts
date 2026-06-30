import { describe, expect, it } from "vitest";
import {
  buildShopifyCartCheckoutUrl,
  inferShopOrigin,
  isLikelyCheckoutUrl,
  normalizeCheckoutUrlInput,
  pickBestCheckoutUrl,
} from "./shopify-checkout-url";

const SAMPLE_CART_GID =
  "gid://shopify/Cart/hWNDkwg7UMZV9kOTMnLMOIX7?key=20619f037279ec2c6a7d53e0f4f3c022";

describe("shopify-checkout-url", () => {
  it("recognizes Shopify cart checkout urls", () => {
    expect(
      isLikelyCheckoutUrl("https://example.myshopify.com/cart/c/test?key=abc")
    ).toBe(true);
  });

  it("prefers checkout-like urls over generic links", () => {
    expect(
      pickBestCheckoutUrl([
        "https://example.com/products/backpack",
        "https://example.myshopify.com/cart/c/test?key=abc",
      ])
    ).toBe("https://example.myshopify.com/cart/c/test?key=abc");
  });

  it("builds checkout urls from cart gids", () => {
    expect(
      buildShopifyCartCheckoutUrl(
        SAMPLE_CART_GID,
        "https://example.myshopify.com"
      )
    ).toBe(
      "https://example.myshopify.com/cart/c/hWNDkwg7UMZV9kOTMnLMOIX7?key=20619f037279ec2c6a7d53e0f4f3c022"
    );
  });

  it("resolves relative checkout paths against the shop origin", () => {
    expect(
      normalizeCheckoutUrlInput(
        "/cart/c/hWNDkwg7UMZV9kOTMnLMOIX7?key=abc",
        "https://example.myshopify.com"
      )
    ).toBe(
      "https://example.myshopify.com/cart/c/hWNDkwg7UMZV9kOTMnLMOIX7?key=abc"
    );
  });

  it("infers shop origin from checkout urls", () => {
    expect(
      inferShopOrigin("https://shop.example.myshopify.com/cart/c/test?key=abc")
    ).toBe("https://shop.example.myshopify.com");
  });
});
