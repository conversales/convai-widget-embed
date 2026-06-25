import type { ShopifyCartSnapshot } from "../types/shopify-cart";
import {
  extractNumericVariantId,
  setShopifyCartCookie,
} from "./shopify-cart-cookie";

type AjaxCart = {
  item_count?: number;
  items?: Array<{ variant_id?: number; quantity?: number }>;
  token?: string;
};

type AjaxCartMutationResponse = AjaxCart & {
  sections?: Record<string, string>;
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
  "cart-notification",
  "cart-icon-bubble",
  "cart-items",
  "cart-live-region-text",
  "mini-cart",
  "header",
] as const;

const SECTIONS_PARAM = SECTION_IDS.join(",");

const LOG_PREFIX = "[CartSync]";

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
    document.querySelector('link[href*="cdn.shopify.com"]') !== null ||
    document.querySelector('script[src*="cdn.shopify.com"]') !== null ||
    document.querySelector('script[src*="shopify.com"]') !== null
  );
}

/** True when the widget runs on a live Shopify storefront (not localhost). */
export function isShopifyStorefront(): boolean {
  return isOnShopifyStorefront();
}

function logSkippedThemeCartSync(reason: string): void {
  console.info(
    `${LOG_PREFIX} Skipped Shopify theme cart API (${reason}). ` +
      "Embed the widget on your Shopify store to sync /cart.js with the theme cart icon."
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

function publishThemeCartUpdate(cart: AjaxCart): void {
  if (typeof window === "undefined") {
    return;
  }

  const win = window as Window & {
    publish?: (event: string, data: unknown) => void;
    PUB_SUB_EVENTS?: { cartUpdate?: string };
  };

  const cartUpdateEvent = win.PUB_SUB_EVENTS?.cartUpdate;
  if (win.publish && cartUpdateEvent) {
    win.publish(cartUpdateEvent, {
      source: "conversales-convai",
      cartData: cart,
    });
  }
}

function applySectionHtml(sections: Record<string, string | undefined>): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const [sectionId, html] of Object.entries(sections)) {
    if (!html) {
      continue;
    }

    const existing =
      document.getElementById(`shopify-section-${sectionId}`) ??
      document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);

    if (existing) {
      existing.outerHTML = html;
      continue;
    }

    const partialMatch = document.querySelector<HTMLElement>(
      `[id*="shopify-section"][id*="${sectionId}"]`
    );
    if (partialMatch) {
      partialMatch.outerHTML = html;
    }
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
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AjaxCart;
  } catch {
    return null;
  }
}

function cartMatchesSnapshot(
  cart: AjaxCart | null,
  snapshot: ShopifyCartSnapshot
): boolean {
  return (
    cart != null &&
    typeof cart.item_count === "number" &&
    cart.item_count === snapshot.lineItemCount
  );
}

function snapshotHasAjaxLineItems(snapshot: ShopifyCartSnapshot): boolean {
  return snapshot.lineItems.some(item => {
    if (!item.variantId || item.quantity <= 0) {
      return false;
    }
    return extractNumericVariantId(item.variantId) != null;
  });
}

async function clearAjaxCart(): Promise<AjaxCartMutationResponse | null> {
  if (typeof fetch === "undefined") {
    return null;
  }

  try {
    const response = await fetch("/cart/clear.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sections: SECTIONS_PARAM,
        sections_url: "/",
      }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AjaxCartMutationResponse;
  } catch {
    return null;
  }
}

async function addItemsViaAjaxCart(
  snapshot: ShopifyCartSnapshot
): Promise<AjaxCartMutationResponse | null> {
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
      body: JSON.stringify({
        items,
        sections: SECTIONS_PARAM,
        sections_url: "/",
      }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AjaxCartMutationResponse;
  } catch {
    return null;
  }
}

async function refreshCartSections(): Promise<void> {
  if (typeof fetch === "undefined") {
    return;
  }

  try {
    const response = await fetch(`/?sections=${SECTIONS_PARAM}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const sections = (await response.json()) as Record<string, string>;
    applySectionHtml(sections);
  } catch {
    // Section refresh is best-effort for theme compatibility.
  }
}

function applyMutationSections(
  mutation: AjaxCartMutationResponse | null | undefined
): void {
  if (mutation?.sections) {
    applySectionHtml(mutation.sections);
  }
}

/**
 * Adds a variant to the theme Ajax cart (/cart/add.js) on Shopify storefronts.
 * Use when the widget's in-chat add-to-cart flow has a variant id available.
 */
export async function addVariantToThemeCart(
  variantId: string,
  quantity = 1
): Promise<ThemeCartSyncResult | null> {
  if (!isOnShopifyStorefront()) {
    logSkippedThemeCartSync("not on a Shopify storefront");
    return null;
  }

  if (!extractNumericVariantId(variantId)) {
    console.warn(
      `${LOG_PREFIX} Cannot call /cart/add.js without a product variant id`
    );
    return null;
  }

  const added = await addItemsViaAjaxCart({
    cartId: "",
    lineItems: [{ variantId, quantity }],
    lineItemCount: quantity,
  });
  applyMutationSections(added);

  const cart = (await fetchAjaxCart()) ?? added ?? null;
  if (cart) {
    publishThemeCartUpdate(cart);
    dispatchThemeCartEvents(cart);
  } else {
    dispatchThemeCartEvents();
  }

  await refreshCartSections();

  if (cart && typeof cart.item_count === "number") {
    return { itemCount: cart.item_count };
  }

  return quantity > 0 ? { itemCount: quantity } : null;
}

/**
 * Syncs the browser Ajax cart with a Storefront API cart snapshot:
 * 1. Sets the Shopify `cart` cookie from the cart GID
 * 2. Rebuilds via /cart/clear.js + /cart/add.js when variant ids are known
 * 3. Applies bundled section HTML and dispatches theme cart events
 */
export async function syncThemeCartFromSnapshot(
  snapshot: ShopifyCartSnapshot
): Promise<ThemeCartSyncResult | null> {
  if (!isOnShopifyStorefront()) {
    logSkippedThemeCartSync("not on a Shopify storefront");
    return null;
  }

  setShopifyCartCookie(snapshot.cartId);

  let cart = await fetchAjaxCart();
  const canRebuildAjaxCart = snapshotHasAjaxLineItems(snapshot);

  if (!cartMatchesSnapshot(cart, snapshot) && canRebuildAjaxCart) {
    const cleared = await clearAjaxCart();
    applyMutationSections(cleared);

    const added = await addItemsViaAjaxCart(snapshot);
    applyMutationSections(added);

    cart = (await fetchAjaxCart()) ?? cart;
    setShopifyCartCookie(snapshot.cartId);
  } else if (!cartMatchesSnapshot(cart, snapshot)) {
    setShopifyCartCookie(snapshot.cartId);
    cart = (await fetchAjaxCart()) ?? cart;
  }

  if (cart) {
    publishThemeCartUpdate(cart);
    dispatchThemeCartEvents(cart);
  } else {
    dispatchThemeCartEvents();
  }

  await refreshCartSections();

  if (!cart) {
    cart = await fetchAjaxCart();
    if (cart) {
      publishThemeCartUpdate(cart);
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
  if (cart) {
    publishThemeCartUpdate(cart);
  }
  dispatchThemeCartEvents(cart ?? undefined);
  await refreshCartSections();
}
