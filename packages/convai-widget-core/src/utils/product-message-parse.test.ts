import { describe, expect, it } from "vitest";
import {
  messageHasStructuredProducts,
  parseStructuredProductBlocks,
} from "./product-message-parse";

const BAG_MESSAGE = `Here are some bags available right now:

Title: Canvas Lunch Bag
Price: Rs. 32.00
Availability: In Stock
Image URL: https://cdn.shopify.com/s/files/1/0993/3327/5969/files/Lunchbag_Khaki_Front_8ae0e1f4-407d-4ac0-89e6-961b306ef351.jpg?v=1782302306 [blocked]

Title: Hudderton Backpack
Price: Rs. 98.00
Availability: In Stock
Image URL: https://cdn.shopify.com/s/files/1/0993/3327/5969/files/hudderton-backpack_dc8afb13-448b-49d9-a042-5a163a97de8f.jpg?v=1782302297 [blocked]

Title: Scout Backpack
Price: Rs. 128.00
Availability: In Stock
Image URL: https://cdn.shopify.com/s/files/1/0993/3327/5969/files/scout-backpack_a035275d-8975-4a05-8456-5e1ec35f020f.jpg?v=1782302304 [blocked]

Title: Derby Tier Backpack
Price: Rs. 148.00
Availability: In Stock
Image URL: https://cdn.shopify.com/s/files/1/0993/3327/5969/files/derbytier_nutmeg_810294de-9152-4bf7-b5e0-b88fc94a1ff8.jpg?v=1782302311 [blocked]

Is there a specific style or type of bag you're looking for, or would you like more details on any of these options?`;

describe("parseStructuredProductBlocks", () => {
  it("parses Title/Price/Image URL product blocks into cards", () => {
    expect(messageHasStructuredProducts(BAG_MESSAGE)).toBe(true);

    const result = parseStructuredProductBlocks(BAG_MESSAGE);
    expect(result.products).toHaveLength(4);
    expect(result.products[0]?.name).toBe("Canvas Lunch Bag");
    expect(result.products[0]?.price).toBe("Rs. 32.00");
    expect(result.products[0]?.imageUrl).toContain("Lunchbag_Khaki_Front");
    expect(result.products[3]?.name).toBe("Derby Tier Backpack");
    expect(result.introMessage).toBe("Here are some bags available right now:");
    expect(result.outroMessage).toContain("specific style");
  });

  it("parses available sizes when provided in the product block", () => {
    const message = `Title: Canvas Lunch Bag
Price: Rs. 32.00
Sizes: S, M, L, XL
Image URL: https://cdn.shopify.com/example.jpg`;

    const result = parseStructuredProductBlocks(message);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.sizes).toEqual(["S", "M", "L", "XL"]);
  });

  it("omits sizes when they are not in the product block", () => {
    const result = parseStructuredProductBlocks(BAG_MESSAGE);
    expect(result.products[0]?.sizes).toBeUndefined();
  });
});
