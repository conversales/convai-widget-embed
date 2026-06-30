import { describe, expect, it } from "vitest";
import {
  formatProductPriceForDisplay,
  formatShopifyNumericPrice,
  formatShopifyPriceValue,
} from "./product-price-display";

describe("product-price-display", () => {
  it("prefixes starting price in real estate mode", () => {
    expect(formatProductPriceForDisplay("$450,000", "starting")).toBe(
      "Starting from $450,000"
    );
    expect(formatProductPriceForDisplay("₹1.2 Cr", "starting")).toBe(
      "Starting from ₹1.2 Cr"
    );
  });

  it("does not double-prefix starting prices", () => {
    expect(
      formatProductPriceForDisplay("Starting from $450,000", "starting")
    ).toBe("Starting from $450,000");
  });

  it("returns undefined when price is missing in starting mode", () => {
    expect(formatProductPriceForDisplay(undefined, "starting")).toBeUndefined();
    expect(formatProductPriceForDisplay("  ", "starting")).toBeUndefined();
  });

  it("keeps standard pricing unchanged for d2c", () => {
    expect(formatProductPriceForDisplay("Rs. 98.00", "standard")).toBe(
      "Rs. 98.00"
    );
    expect(formatProductPriceForDisplay("$19.99", "standard")).toBe("$19.99");
  });

  it("preserves currency from agent text instead of defaulting to rupees", () => {
    expect(formatShopifyPriceValue("$19.99")).toBe("$19.99");
    expect(formatShopifyPriceValue("Rs. 98.00")).toBe("Rs. 98.00");
    expect(formatShopifyPriceValue("9800", { symbol: "$" })).toBe("$98.00");
    expect(formatShopifyPriceValue(9800, { code: "USD" })).toBe("USD 98.00");
    expect(formatShopifyPriceValue(9800)).toBe("98.00");
  });

  it("formats numeric cents with provided currency hints", () => {
    expect(formatShopifyNumericPrice(9800, { symbol: "₹" })).toBe("₹98.00");
    expect(formatShopifyNumericPrice(9800, { code: "EUR" })).toBe("EUR 98.00");
    expect(formatShopifyNumericPrice(9800)).toBe("98.00");
  });
});
