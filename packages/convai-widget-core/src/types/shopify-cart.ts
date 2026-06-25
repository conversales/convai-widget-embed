export const SHOPIFY_CART_TOOL_NAMES = ["update_cart", "get_cart"] as const;

export type ShopifyCartToolName = (typeof SHOPIFY_CART_TOOL_NAMES)[number];

export type ShopifyCartLineItem = {
  id?: string;
  quantity: number;
  title?: string;
  variantId?: string;
};

export type ShopifyCartSnapshot = {
  cartId: string;
  checkoutUrl?: string;
  lineItems: ShopifyCartLineItem[];
  lineItemCount: number;
};

export type ShopifyCartStorage = {
  cartId: string;
  checkoutUrl?: string;
  lineItemCount: number;
  updatedAt: number;
};

export function isShopifyCartToolName(
  toolName: string
): toolName is ShopifyCartToolName {
  return (SHOPIFY_CART_TOOL_NAMES as readonly string[]).includes(toolName);
}
