import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  extractCartCookieToken,
  extractNumericVariantId,
  setShopifyCartCookie,
} from "./shopify-cart-cookie";
import { parseCartFromAgentText } from "./shopify-cart-parse";

const SAMPLE_CART_GID =
  "gid://shopify/Cart/hWNDkwg7UMZV9kOTMnLMOIX7?key=20619f037279ec2c6a7d53e0f4f3c022";

describe("shopify-cart-cookie", () => {
  it("extracts cookie token from cart GID", () => {
    expect(extractCartCookieToken(SAMPLE_CART_GID)).toBe(
      "hWNDkwg7UMZV9kOTMnLMOIX7?key=20619f037279ec2c6a7d53e0f4f3c022"
    );
  });

  it("extracts numeric variant id from GID", () => {
    expect(
      extractNumericVariantId("gid://shopify/ProductVariant/40123456789")
    ).toBe("40123456789");
  });

  it("sets the cart cookie on document", () => {
    const cookies: string[] = [];
    vi.stubGlobal("document", {
      get cookie() {
        return cookies.join("; ");
      },
      set cookie(value: string) {
        cookies.push(value);
      },
    });

    expect(setShopifyCartCookie(SAMPLE_CART_GID)).toBe(true);
    expect(cookies[0]).toContain("cart=");
    expect(cookies[0]).toContain(
      "hWNDkwg7UMZV9kOTMnLMOIX7?key=20619f037279ec2c6a7d53e0f4f3c022"
    );
  });
});

describe("parseCartFromAgentText", () => {
  it("parses cart details from agent plain text", () => {
    const message = `Hudderton Backpack has been added to your cart.

Cart Details:
Cart ID: ${SAMPLE_CART_GID}

Checkout URL:
Cart Lines: 1 x Hudderton Backpack (Khaki)
Total Quantity: 1`;

    expect(parseCartFromAgentText(message)).toEqual({
      cartId: SAMPLE_CART_GID,
      checkoutUrl: undefined,
      lineItems: [],
      lineItemCount: 1,
    });
  });

  it("parses checkout url when present", () => {
    const message = `Cart ID: ${SAMPLE_CART_GID}
Checkout URL: https://example.myshopify.com/cart/c/test?key=abc
Total Quantity: 2`;

    expect(parseCartFromAgentText(message)?.checkoutUrl).toBe(
      "https://example.myshopify.com/cart/c/test?key=abc"
    );
    expect(parseCartFromAgentText(message)?.lineItemCount).toBe(2);
  });

  it("parses checkout url on the next line", () => {
    const message = `Cart ID: ${SAMPLE_CART_GID}
Checkout URL:
https://example.myshopify.com/cart/c/test?key=abc
Total Quantity: 1`;

    expect(parseCartFromAgentText(message)?.checkoutUrl).toBe(
      "https://example.myshopify.com/cart/c/test?key=abc"
    );
  });
});
