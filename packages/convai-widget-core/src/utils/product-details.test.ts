import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranscriptEntry } from "../contexts/conversation";
import {
  extractAgentProductDetailText,
  findAgentDetailResponseAfterRequest,
  getShopifyProductJsonUrl,
  isValidProductDetailName,
  formatExpandedProductDescription,
  isProductDetailStructuredMessage,
  looksLikeMarkdownMessage,
  normalizeProductDetailsPayload,
  normalizeProductRecord,
  parseAgentProductDetailContent,
} from "./product-details";

describe("product-details", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts intro text from agent product responses", () => {
    expect(
      extractAgentProductDetailText(
        "This bag is water-resistant and lightweight.\nTitle: Other Bag\nPrice: Rs. 10"
      )
    ).toBe("This bag is water-resistant and lightweight.");
  });

  it("finds the first agent detail response after a request", () => {
    const entries = [
      {
        type: "message",
        role: "user",
        message: "I need more details about Hudderton Backpack. Product ID: 1",
        displayMessage: "I need more details about Hudderton Backpack",
        isText: true,
        conversationIndex: 0,
      },
      {
        type: "message",
        role: "agent",
        message: "It has padded straps and a laptop sleeve.",
        isText: true,
        conversationIndex: 0,
      },
    ] as TranscriptEntry[];

    expect(findAgentDetailResponseAfterRequest(entries, 0)).toBe(
      "It has padded straps and a laptop sleeve."
    );
  });

  it("normalizes backend product payloads", () => {
    const result = normalizeProductDetailsPayload({
      product: {
        product_id: "123",
        title: "Hudderton Backpack",
        image_url: "https://cdn.example.com/backpack.jpg",
        price: "Rs. 98.00",
        description: "<p>Comfortable everyday backpack</p>",
        category: "Bags",
      },
      recommendations: [
        {
          name: "Campus Tote",
          imageUrl: "https://cdn.example.com/tote.jpg",
          price: "Rs. 120.00",
        },
      ],
    });

    expect(result?.product.name).toBe("Hudderton Backpack");
    expect(result?.product.id).toBe("123");
    expect(result?.product.description).toBe("Comfortable everyday backpack");
    expect(result?.recommendations).toHaveLength(1);
    expect(result?.recommendations[0]?.name).toBe("Campus Tote");
  });

  it("builds same-origin Shopify product json urls", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://shop.example.com",
        href: "https://shop.example.com/",
      },
    });

    const url = getShopifyProductJsonUrl(
      "https://shop.example.com/products/hudderton-backpack"
    );

    expect(url).toBe("https://shop.example.com/products/hudderton-backpack.js");
  });

  it("formats Shopify price values without hardcoded currency", () => {
    expect(normalizeProductRecord({ title: "Bag", price: 9800 })?.price).toBe(
      "98.00"
    );
    expect(
      normalizeProductRecord({
        title: "Bag",
        price: 9800,
        currency_symbol: "$",
      })?.price
    ).toBe("$98.00");
    expect(
      normalizeProductRecord({
        title: "Bag",
        price: "Rs. 98.00",
      })?.price
    ).toBe("Rs. 98.00");
  });

  it("parses structured agent product detail responses", () => {
    const base = {
      name: "Hudderton Backpack",
      price: "Rs. 98.00",
      description: "Original description",
    };

    const parsed = parseAgentProductDetailContent(
      [
        "Here are the details for the Hudderton Backpack:",
        "Title: Hudderton Backpack",
        "Price: Rs. 98.00",
        "Available Colors: Khaki, Moss, Nutmeg, Navy Blue",
        "Description: Durable, rugged, and dependable backpack with padded straps.",
      ].join("\n"),
      base
    );

    expect(parsed.name).toBe("Hudderton Backpack");
    expect(parsed.price).toBe("Rs. 98.00");
    expect(parsed.colors).toEqual(["Khaki", "Moss", "Nutmeg", "Navy Blue"]);
    expect(parsed.description).toContain("Original description");
    expect(parsed.description).toContain(
      "Durable, rugged, and dependable backpack with padded straps."
    );
  });

  it("does not use metadata lines as product names", () => {
    expect(
      isValidProductDetailName(
        "Available Colors: Khaki, Moss, Nutmeg, Navy Blue",
        "Hudderton Backpack"
      )
    ).toBe("Hudderton Backpack");
  });

  it("detects structured product detail messages", () => {
    expect(
      isProductDetailStructuredMessage(
        "Price: Rs. 98.00\nAvailable Colors: Khaki, Moss"
      )
    ).toBe(true);
    expect(
      isProductDetailStructuredMessage(
        "- Durable rugged backpack\n- Padded laptop sleeve\n- Lifetime guarantee"
      )
    ).toBe(true);
    expect(
      isProductDetailStructuredMessage(
        "Here are some bags available right now:\n\nTitle: Canvas Lunch Bag\nPrice: Rs. 32.00\n\nTitle: Scout Backpack\nPrice: Rs. 128.00"
      )
    ).toBe(false);
    expect(
      isProductDetailStructuredMessage(
        "Here are the details for the Hudderton Backpack:\nTitle: Hudderton Backpack\nPrice: Rs. 98.00"
      )
    ).toBe(true);
  });

  it("does not classify markdown agent messages as product details", () => {
    expect(
      looksLikeMarkdownMessage(`# Heading 1

This is **bold** and *italic* text.

- List item 1
- List item 2

1. Ordered item 1
2. Ordered item 2

\`inline code\`

[Link text](https://example.com)

| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |`)
    ).toBe(true);
    expect(
      isProductDetailStructuredMessage(`# Heading 1

- List item 1
- List item 2`)
    ).toBe(false);
    expect(
      isProductDetailStructuredMessage(
        "[Allowed https link](https://example.com/allowed)\n\n[Blocked link](https://evil.com/blocked)"
      )
    ).toBe(false);
  });

  it("formats expanded product descriptions as bullet points without urls", () => {
    const bullets = formatExpandedProductDescription(
      [
        "Product Page: https://xu7xfr-ij.myshopify.com/products/hudderton-backpack",
        "The Hudderton Backpack is durable, rugged, and dependable. It features four zipper compartments, two front pockets for easy access to small items, a large compartment with a padded laptop sleeve, and a small top pouch for keys or other essentials. Made from 100% organic waxed 18 oz canvas, with a full grain genuine leather bottom, soft cotton lining, brass hardware, YKK zippers, and padded shoulder straps for all-day comfort. Perfect for commutes or trails and comes with a lifetime guarantee.",
        "Would you like to add this backpack to your cart? If yes, please let me know your preferred color.",
      ].join("\n")
    );

    expect(bullets.some(bullet => bullet.includes("https://"))).toBe(false);
    expect(bullets.some(bullet => /Product Page/i.test(bullet))).toBe(false);
    expect(bullets.some(bullet => /Would you like/i.test(bullet))).toBe(false);
    expect(bullets[0]).toMatch(/durable, rugged, and dependable/i);
    expect(bullets).toContain("four zipper compartments");
    expect(bullets).toContain(
      "two front pockets for easy access to small items"
    );
    expect(
      bullets.some(bullet => /100% organic waxed 18 oz canvas/i.test(bullet))
    ).toBe(true);
    expect(bullets.some(bullet => /lifetime guarantee/i.test(bullet))).toBe(
      true
    );
    expect(
      bullets.some(bullet => /choose from these color options/i.test(bullet))
    ).toBe(false);
  });

  it("omits availability metadata from expanded descriptions when requested", () => {
    const bullets = formatExpandedProductDescription(
      ["Availability: In Stock", "Spacious 3BHK with balcony views."].join(
        "\n"
      ),
      { omitAvailabilityLines: true }
    );

    expect(bullets.some(bullet => /in stock/i.test(bullet))).toBe(false);
    expect(bullets.some(bullet => /3BHK/i.test(bullet))).toBe(true);
  });

  it("preserves existing markdown-style bullet descriptions", () => {
    expect(
      formatExpandedProductDescription(
        "- Durable rugged backpack\n- Padded laptop sleeve\n- Lifetime guarantee"
      )
    ).toEqual([
      "Durable rugged backpack",
      "Padded laptop sleeve",
      "Lifetime guarantee",
    ]);
  });

  it("extracts image url and filters invalid color tokens", () => {
    const parsed = parseAgentProductDetailContent(
      [
        "Price: Rs. 98.00",
        "Available Colors: Khaki, Moss, Nutmeg, Navy Blue (Khaki is currently selected and available)",
        "Image URL: https://cdn.example.com/backpack.jpg",
        "- Durable rugged backpack",
        "- Padded laptop sleeve",
      ].join("\n"),
      { name: "Hudderton Backpack" }
    );

    expect(parsed.price).toBe("Rs. 98.00");
    expect(parsed.imageUrl).toBe("https://cdn.example.com/backpack.jpg");
    expect(parsed.colors).toEqual(["Khaki", "Moss", "Nutmeg", "Navy Blue"]);
    expect(parsed.description).toContain("Durable rugged backpack");
    expect(parsed.description).toContain(
      "Khaki is currently selected and available"
    );
  });
});
