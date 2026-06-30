import type { ProductCardData } from "../types/product-card";

export function getProductDisplayName(value: string): string {
  let name = value.trim();
  if (!name) {
    return value;
  }

  name = name.replace(/^(?:Title|Name|Product):\s*/i, "");
  name = name.replace(/\.\s*Product\s+ID:\s*\S+.*$/i, "");
  name = name.replace(/\s*\(ID:\s*[^)]+\)\s*$/i, "");
  name = name.replace(/\s+Product\s+ID:\s*\S+.*$/i, "");

  const dashMatch = name.match(/^(.+?)\s+[—-]\s+(?:[$€£₹]|\d)/);
  if (dashMatch?.[1]) {
    name = dashMatch[1].trim();
  }

  return name || value.trim();
}

export function extractProductIdFromText(value: string): string | undefined {
  const match = value.match(/Product\s+ID:\s*(\S+)/i);
  return match?.[1]?.replace(/[.,;]+$/, "");
}

export function extractProductIdFromRecord(
  record: Record<string, unknown>
): string | undefined {
  const raw =
    record.id ?? record.product_id ?? record.productId ?? record.sku ?? null;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

export function withProductDisplayName(
  product: ProductCardData
): ProductCardData {
  return {
    ...product,
    name: getProductDisplayName(product.name),
  };
}

export function buildProductDetailsRequestMessages(product: ProductCardData): {
  displayText: string;
  backendText: string;
} {
  const displayName = getProductDisplayName(product.name);
  const displayText = `I need more details about ${displayName}`;
  const backendText = product.id
    ? `${displayText}. Product ID: ${product.id}`
    : displayText;

  return { displayText, backendText };
}

export function isProductDetailsRequestMessage(
  message: string,
  displayMessage?: string
): boolean {
  const text = getUserMessageDisplayText(message, displayMessage);
  return /^i need more details about /i.test(text);
}

export function buildProductViewMessages(product: ProductCardData): {
  displayText: string;
  backendText: string;
} {
  const displayName = getProductDisplayName(product.name);
  const displayText = `Tell me more about ${displayName}`;
  const backendText = product.id
    ? `${displayText}. Product ID: ${product.id}`
    : displayText;

  return { displayText, backendText };
}

export function appendCartIdToBackendText(
  backendText: string,
  cartId?: string | null
): string {
  const trimmed = cartId?.trim();
  if (!trimmed) {
    return backendText;
  }

  return `${backendText}. Cart ID: ${trimmed}`;
}

export function buildAddToCartMessages(
  product: ProductCardData,
  options?: { cartId?: string | null; size?: string; color?: string }
): {
  displayText: string;
  backendText: string;
} {
  const displayName = getProductDisplayName(product.name);
  const variantLabel = options?.color ?? options?.size;
  const variantPrefix = options?.color
    ? `(${options.color})`
    : options?.size
      ? `(size ${options.size})`
      : "";
  const displayText = variantLabel
    ? `Add ${displayName} ${variantPrefix} to cart`
    : `Add ${displayName} to cart`;
  const backendWithProductId = product.id
    ? `${displayText}. Product ID: ${product.id}`
    : displayText;
  const backendText = appendCartIdToBackendText(
    backendWithProductId,
    options?.cartId
  );

  return { displayText, backendText };
}

export function isAddToCartUserMessage(
  message: string,
  displayMessage?: string
): boolean {
  const text = getUserMessageDisplayText(message, displayMessage).trim();
  return /^add(?:ed)? .+ to cart$/i.test(text);
}

export function getUserMessageDisplayText(
  message: string,
  displayMessage?: string
): string {
  if (displayMessage) {
    return displayMessage;
  }

  return message
    .replace(/\.\s*Product\s+ID:\s*\S+.*$/i, "")
    .replace(/\s+Product\s+ID:\s*\S+.*$/i, "")
    .replace(/\.\s*Cart\s+ID:\s*\S+.*$/i, "")
    .replace(/\s+Cart\s+ID:\s*\S+.*$/i, "")
    .trim();
}
