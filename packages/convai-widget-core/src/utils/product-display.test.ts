import { describe, expect, it } from "vitest";
import {
  buildAddToCartMessages,
  buildProductViewMessages,
  getProductDisplayName,
  getUserMessageDisplayText,
} from "./product-display";

describe("product-display", () => {
  it("extracts a short display name from a long product line", () => {
    expect(
      getProductDisplayName(
        "Classic White Tee — $49.99 (was $59.99). Premium cotton t-shirt. In stock. Product ID: 1"
      )
    ).toBe("Classic White Tee");
  });

  it("sends product id to backend while keeping a short display message", () => {
    const messages = buildProductViewMessages({
      id: "1",
      name: "Classic White Tee",
    });

    expect(messages.displayText).toBe("Tell me more about Classic White Tee");
    expect(messages.backendText).toBe(
      "Tell me more about Classic White Tee. Product ID: 1"
    );
  });

  it("strips product id from user messages without display text", () => {
    expect(
      getUserMessageDisplayText(
        "Tell me more about Classic White Tee. Product ID: 1"
      )
    ).toBe("Tell me more about Classic White Tee");
  });

  it("includes cart id in add-to-cart backend text when provided", () => {
    const messages = buildAddToCartMessages(
      { id: "123", name: "Camp Stool" },
      { cartId: "gid://shopify/Cart/abc?key=def" }
    );

    expect(messages.displayText).toBe("Add Camp Stool to cart");
    expect(messages.backendText).toBe(
      "Add Camp Stool to cart. Product ID: 123. Cart ID: gid://shopify/Cart/abc?key=def"
    );
  });

  it("strips cart id from user messages without display text", () => {
    expect(
      getUserMessageDisplayText(
        "Add Camp Stool to cart. Product ID: 123. Cart ID: gid://shopify/Cart/abc?key=def"
      )
    ).toBe("Add Camp Stool to cart");
  });
});
