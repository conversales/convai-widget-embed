import type { ShopifyCartSnapshot } from "../types/shopify-cart";
import {
  extractNumericVariantId,
  readShopifyCartCookie,
  setShopifyCartCookie,
} from "./shopify-cart-cookie";

type AjaxCart = {
  item_count?: number;
  items?: Array<{ variant_id?: number; quantity?: number }>;
};

export type ThemeCartSyncResult = {
  itemCount: number;
};

const THEME_CART_EVENTS = [
  "cart:updated",
  "cart:refresh",
  "cart:change",
  "theme:cart:change",
] as const;

const SECTION_IDS = [
  "cart-drawer",
  "cart-icon-bubble",
  "cart-items",
  "mini-cart",
  "header",
] as const;

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

function isOnShopifyStorefront(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const { hostname } = window.location;
  if (isLocalDevHost(hostname)) {
    return false;
  }

  return (
    hostname.endsWith(".myshopify.com") ||
    hostname === "myshopify.com" ||
    // Custom domains on Shopify still use relative /cart.js
    document.querySelector('link[href*="cdn.shopify.com"]') !== null ||
    document.querySelector('script[src*="cdn.shopify.com"]') !== null
  );
}

function dispatchThemeCartEvents(cart?: AjaxCart): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const name of THEME_CART_EVENTS) {
    document.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        detail: cart ? { cart } : undefined,
      })
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cart:updated", {
        detail: cart ? { cart } : undefined,
      })
    );
  }
}

async function fetchAjaxCart(): Promise<AjaxCart | null> {
  if (typeof fetch === "undefined") {
    return null;
  }

  try {
    const response = await fetch("/cart.js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AjaxCart;
  } catch {
    return null;
  }
}

async function addItemsViaAjaxCart(
  snapshot: ShopifyCartSnapshot
): Promise<AjaxCart | null> {
  if (typeof fetch === "undefined") {
    return null;
  }

  const items = snapshot.lineItems
    .map(item => {
      const variantId = item.variantId
        ? extractNumericVariantId(item.variantId)
        : null;
      if (!variantId || item.quantity <= 0) {
        return null;
      }
      return { id: Number(variantId), quantity: item.quantity };
    })
    .filter((item): item is { id: number; quantity: number } => item !== null);

  if (items.length === 0) {
    return null;
  }

  try {
    const response = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AjaxCart;
  } catch {
    return null;
  }
}

async function refreshCartSections(): Promise<void> {
  if (typeof fetch === "undefined") {
    return;
  }

  try {
    await fetch(`/?sections=${SECTION_IDS.join(",")}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    // Section refresh is best-effort for theme compatibility.
  }
}

function cartCookieMatchesCartId(cartId: string): boolean {
  const cookieToken = readShopifyCartCookie();
  if (!cookieToken) {
    return false;
  }

  const expectedToken = cartId.includes("gid://")
    ? cartId.replace(/^gid:\/\/shopify\/Cart\//i, "")
    : cartId;

  return cookieToken === expectedToken;
}

/**
 * Syncs the browser Ajax cart with a Storefront API cart snapshot:
 * 1. Sets the Shopify `cart` cookie from the cart GID
 * 2. Verifies via /cart.js; falls back to /cart/add.js when variants are known
 * 3. Dispatches theme events and refreshes cart sections
 */
export async function syncThemeCartFromSnapshot(
  snapshot: ShopifyCartSnapshot
): Promise<ThemeCartSyncResult | null> {
  if (!isOnShopifyStorefront()) {
    return null;
  }

  setShopifyCartCookie(snapshot.cartId);

  let cart = await fetchAjaxCart();
  const expectedCount = snapshot.lineItemCount;
  const hasExpectedItems =
    cart != null &&
    typeof cart.item_count === "number" &&
    cart.item_count >= expectedCount &&
    cartCookieMatchesCartId(snapshot.cartId);

  if (!hasExpectedItems) {
    const addedCart = await addItemsViaAjaxCart(snapshot);
    if (addedCart) {
      cart = addedCart;
    } else {
      setShopifyCartCookie(snapshot.cartId);
      cart = (await fetchAjaxCart()) ?? cart;
    }
  }

  dispatchThemeCartEvents(cart ?? undefined);
  await refreshCartSections();

  if (!cart) {
    cart = await fetchAjaxCart();
    if (cart) {
      dispatchThemeCartEvents(cart);
    }
  }

  if (cart && typeof cart.item_count === "number") {
    return { itemCount: cart.item_count };
  }

  return snapshot.lineItemCount > 0
    ? { itemCount: snapshot.lineItemCount }
    : null;
}

/** @deprecated Use syncThemeCartFromSnapshot */
export async function refreshThemeCart(): Promise<void> {
  const cart = await fetchAjaxCart();
  dispatchThemeCartEvents(cart ?? undefined);
  await refreshCartSections();
}
