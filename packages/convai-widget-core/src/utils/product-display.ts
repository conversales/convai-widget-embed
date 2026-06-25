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
  options?: { cartId?: string | null; size?: string }
): {
  displayText: string;
  backendText: string;
} {
  const displayName = getProductDisplayName(product.name);
  const displayText = options?.size
    ? `Add ${displayName} (size ${options.size}) to cart`
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

export function isAddToCartUserMessage(message: string): boolean {
  const trimmed = message.trim();
  return (
    /^add(?:ed)? .+ to cart$/i.test(trimmed) ||
    /^add(?:ed)? .+ \(size .+\) to cart$/i.test(trimmed)
  );
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
