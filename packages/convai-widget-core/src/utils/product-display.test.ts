import { describe, expect, it } from "vitest";
import {
  buildAddToCartMessages,
  buildProductDetailsRequestMessages,
  buildProductViewMessages,
  getProductDisplayName,
  getUserMessageDisplayText,
  isAddToCartUserMessage,
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

  it("requests more product details for the detail page", () => {
    const messages = buildProductDetailsRequestMessages({
      id: "99",
      name: "Hudderton Backpack",
    });

    expect(messages.displayText).toBe(
      "I need more details about Hudderton Backpack"
    );
    expect(messages.backendText).toBe(
      "I need more details about Hudderton Backpack. Product ID: 99"
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

  it("includes selected color in add-to-cart messages", () => {
    const messages = buildAddToCartMessages(
      { id: "99", name: "Hudderton Backpack" },
      { color: "Khaki" }
    );

    expect(messages.displayText).toBe("Add Hudderton Backpack (Khaki) to cart");
    expect(messages.backendText).toBe(
      "Add Hudderton Backpack (Khaki) to cart. Product ID: 99"
    );
  });

  it("strips cart id from user messages without display text", () => {
    expect(
      getUserMessageDisplayText(
        "Add Camp Stool to cart. Product ID: 123. Cart ID: gid://shopify/Cart/abc?key=def"
      )
    ).toBe("Add Camp Stool to cart");
  });

  it("detects add-to-cart messages with backend metadata", () => {
    expect(
      isAddToCartUserMessage(
        "Add Hudderton Backpack (Khaki) to cart. Product ID: 99. Cart ID: gid://shopify/Cart/abc"
      )
    ).toBe(true);
  });
});
