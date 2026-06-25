import type {
  ShopifyCartLineItem,
  ShopifyCartSnapshot,
} from "../types/shopify-cart";

const LOG_PREFIX = "[CartSync]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseLineItem(value: unknown): ShopifyCartLineItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const merchandise = isRecord(value.merchandise) ? value.merchandise : null;
  const merchandiseProduct =
    merchandise && isRecord(merchandise.product) ? merchandise.product : null;

  const quantity =
    readNumber(value.quantity) ??
    readNumber(value.qty) ??
    readNumber(value.merchandise_quantity);
  if (quantity == null || quantity < 0) {
    return null;
  }

  return {
    id: readString(value.id) ?? readString(value.line_id),
    quantity,
    title:
      readString(value.title) ??
      readString(value.name) ??
      readString(value.product_title) ??
      readString(merchandise?.title) ??
      readString(merchandiseProduct?.title),
    variantId:
      readString(value.variant_id) ??
      readString(value.product_variant_id) ??
      readString(value.merchandise_id) ??
      readString(merchandise?.id),
  };
}

function extractLineItemValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.edges)) {
    return value.edges
      .map(edge => (isRecord(edge) ? (edge.node ?? edge) : edge))
      .filter(entry => entry != null);
  }

  if (Array.isArray(value.nodes)) {
    return value.nodes;
  }

  return [];
}

function parseLineItems(value: unknown): ShopifyCartLineItem[] {
  return extractLineItemValues(value)
    .map(parseLineItem)
    .filter((item): item is ShopifyCartLineItem => item !== null);
}

function countLineItems(lineItems: ShopifyCartLineItem[]): number {
  return lineItems.reduce((total, item) => total + item.quantity, 0);
}

function extractCartId(record: Record<string, unknown>): string | undefined {
  return (
    readString(record.id) ??
    readString(record.cart_id) ??
    readString(record.cartId)
  );
}

function extractCheckoutUrl(
  record: Record<string, unknown>
): string | undefined {
  return (
    readString(record.checkout_url) ??
    readString(record.checkoutUrl) ??
    readString(record.checkout_url_v2)
  );
}

function normalizeCartRecord(
  record: Record<string, unknown>
): ShopifyCartSnapshot | null {
  const nestedCart = isRecord(record.cart) ? record.cart : null;
  const source = nestedCart ?? record;

  const cartId = extractCartId(source);
  if (!cartId) {
    return null;
  }

  const lineItems = parseLineItems(
    source.lines ??
      source.line_items ??
      source.lineItems ??
      source.items ??
      record.lines ??
      record.line_items
  );

  const totalQuantity = readNumber(
    source.total_quantity ?? source.item_count ?? source.lineItemCount
  );

  const lineItemCount =
    totalQuantity != null && totalQuantity >= 0
      ? totalQuantity
      : countLineItems(lineItems);

  return {
    cartId,
    checkoutUrl: extractCheckoutUrl(source) ?? extractCheckoutUrl(record),
    lineItems,
    lineItemCount,
  };
}

export function parseJsonCartPayload(
  payload: string
): ShopifyCartSnapshot | null {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed)) {
      return normalizeCartRecord(parsed);
    }
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (isRecord(entry)) {
          const snapshot = normalizeCartRecord(entry);
          if (snapshot) {
            return snapshot;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to parse cart JSON`, error);
  }

  return null;
}

export function parseMcpResultBlocks(
  result: Record<string, unknown>[]
): ShopifyCartSnapshot | null {
  for (const block of result) {
    const text = readString(block.text) ?? readString(block.content);
    if (text) {
      const snapshot = parseJsonCartPayload(text);
      if (snapshot) {
        return snapshot;
      }
    }

    if (isRecord(block)) {
      const snapshot = normalizeCartRecord(block);
      if (snapshot) {
        return snapshot;
      }
    }
  }

  return null;
}

const AGENT_CART_ID_PATTERN = /Cart\s*ID:\s*(gid:\/\/shopify\/Cart\/[^\s\n]+)/i;
const AGENT_CHECKOUT_URL_PATTERN = /Checkout\s*URL:\s*(https?:\/\/[^\s\n]+)/i;
const AGENT_TOTAL_QUANTITY_PATTERN = /Total\s*Quantity:\s*(\d+)/i;

/**
 * Parses cart details from agent plain-text responses (e.g. "Cart ID: gid://...").
 */
export function parseCartFromAgentText(
  message: string
): ShopifyCartSnapshot | null {
  const cartIdMatch = message.match(AGENT_CART_ID_PATTERN);
  if (!cartIdMatch?.[1]) {
    return null;
  }

  const cartId = cartIdMatch[1].trim();
  const checkoutUrlMatch = message.match(AGENT_CHECKOUT_URL_PATTERN);
  const checkoutUrl = checkoutUrlMatch?.[1]?.trim();
  const qtyMatch = message.match(AGENT_TOTAL_QUANTITY_PATTERN);
  const lineItemCount = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  return {
    cartId,
    checkoutUrl: checkoutUrl || undefined,
    lineItems: [],
    lineItemCount: Number.isFinite(lineItemCount) ? lineItemCount : 1,
  };
}

export function parseCartToolPayload(
  payload: string | Record<string, unknown>[]
): ShopifyCartSnapshot | null {
  if (typeof payload === "string") {
    return parseJsonCartPayload(payload);
  }

  const fromBlocks = parseMcpResultBlocks(payload);
  if (fromBlocks) {
    return fromBlocks;
  }

  for (const block of payload) {
    if (isRecord(block)) {
      const snapshot = normalizeCartRecord(block);
      if (snapshot) {
        return snapshot;
      }
    }
  }

  return null;
}
