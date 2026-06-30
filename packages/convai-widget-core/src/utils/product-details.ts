import type { ProductCardData } from "../types/product-card";
import type { TranscriptEntry } from "../contexts/conversation";
import type { DisplayTranscriptEntry } from "./display-transcript";
import {
  extractProductIdFromRecord,
  getUserMessageDisplayText,
  isProductDetailsRequestMessage,
  withProductDisplayName,
} from "./product-display";
import {
  extractIntroBeforeStructuredProducts,
  messageHasStructuredProducts,
  normalizeProductMessage,
} from "./product-message-parse";
import { extractSizesFromRecord } from "./product-message-parse";
import { getWidgetApiBaseUrl } from "./widget-api";
import { formatShopifyPriceValue } from "./product-price-display";

export type WidgetProductDetailsParams = {
  agentId: string;
  accountId?: string;
  productId?: string;
  imageUrl?: string;
  productName?: string;
  productUrl?: string;
};

export type ProductDetailsResult = {
  product: ProductCardData;
  recommendations: ProductCardData[];
};

function parseApiPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : record;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractCurrencyHints(record: Record<string, unknown>) {
  return {
    symbol: firstNonEmptyString(record.currency_symbol, record.currencySymbol),
    code: firstNonEmptyString(
      record.currency,
      record.currency_code,
      record.currencyCode
    ),
  };
}

export function normalizeProductRecord(
  record: unknown
): ProductCardData | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const value = record as Record<string, unknown>;
  const rawDescription = firstNonEmptyString(
    value.description,
    value.body_html,
    value.bodyHtml,
    value.summary
  );
  const name = firstNonEmptyString(
    value.name,
    value.title,
    value.product_name,
    value.productName
  );

  if (!name) {
    return null;
  }

  const currency = extractCurrencyHints(value);

  return withProductDisplayName({
    id: extractProductIdFromRecord(value),
    name,
    price:
      formatShopifyPriceValue(value.price, currency) ??
      formatShopifyPriceValue(value.sale_price, currency) ??
      formatShopifyPriceValue(value.salePrice, currency) ??
      firstNonEmptyString(value.mrp, value.offer_price, value.offerPrice),
    imageUrl: firstNonEmptyString(
      value.imageUrl,
      value.image_url,
      value.image,
      value.thumbnail,
      value.featured_image,
      value.featuredImage
    ),
    productUrl: firstNonEmptyString(
      value.productUrl,
      value.product_url,
      value.url,
      value.link
    ),
    description: rawDescription ? stripHtml(rawDescription) : undefined,
    category: firstNonEmptyString(
      value.category,
      value.product_type,
      value.productType,
      value.vendor
    ),
    sizes: extractSizesFromRecord(value),
  });
}

export function normalizeProductDetailsPayload(
  payload: unknown
): ProductDetailsResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const productRecord =
    record.product ??
    record.productDetails ??
    record.product_details ??
    record.item ??
    record;

  const product = normalizeProductRecord(productRecord);
  if (!product) {
    return null;
  }

  const recommendationSource = [
    record.recommendations,
    record.recommended_products,
    record.recommendedProducts,
    record.related_products,
    record.relatedProducts,
  ].find(Array.isArray);

  const recommendations = (recommendationSource ?? [])
    .map(entry => normalizeProductRecord(entry))
    .filter((entry): entry is ProductCardData => !!entry)
    .slice(0, 3);

  return { product, recommendations };
}

export function getShopifyProductJsonUrl(productUrl?: string): string | null {
  if (!productUrl || typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(productUrl, window.location.href);
    const match = url.pathname.match(/\/products\/([^/?#]+)/i);
    if (!match?.[1]) {
      return null;
    }

    if (url.origin !== window.location.origin) {
      return null;
    }

    return `${url.origin}/products/${encodeURIComponent(match[1])}.js`;
  } catch {
    return null;
  }
}

function mapShopifyProductJson(
  json: Record<string, unknown>,
  productUrl?: string
): ProductCardData | null {
  const images = Array.isArray(json.images)
    ? json.images
        .map(image =>
          image && typeof image === "object"
            ? firstNonEmptyString(
                (image as Record<string, unknown>).src,
                (image as Record<string, unknown>).url
              )
            : undefined
        )
        .filter(Boolean)
    : [];

  const variants = Array.isArray(json.variants) ? json.variants : [];
  const firstVariant =
    variants[0] && typeof variants[0] === "object"
      ? (variants[0] as Record<string, unknown>)
      : null;

  return normalizeProductRecord({
    id:
      firstVariant?.id ??
      json.id ??
      extractProductIdFromRecord(json as Record<string, unknown>),
    name: json.title,
    description: json.description,
    category: json.product_type,
    imageUrl: images[0] ?? json.featured_image,
    productUrl: productUrl ?? json.url,
    price: firstVariant?.price ?? json.price_min ?? json.price,
    sizes: Array.isArray(json.options)
      ? (json.options as Record<string, unknown>[]).find(option =>
          /size/i.test(String(option.name ?? ""))
        )?.values
      : undefined,
  });
}

async function fetchWidgetProductDetails(
  params: WidgetProductDetailsParams,
  signal?: AbortSignal
): Promise<ProductDetailsResult | null> {
  const agentId = params.agentId.trim();
  const accountId = params.accountId?.trim();
  const productId = params.productId?.trim();
  const imageUrl = params.imageUrl?.trim();
  const productName = params.productName?.trim();
  const productUrl = params.productUrl?.trim();

  if (!agentId || (!productId && !imageUrl && !productName && !productUrl)) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({ agentId });
    if (accountId) {
      searchParams.set("accountId", accountId);
    }
    if (productId) {
      searchParams.set("productId", productId);
    }
    if (imageUrl) {
      searchParams.set("imageUrl", imageUrl);
    }
    if (productName) {
      searchParams.set("productName", productName);
    }
    if (productUrl) {
      searchParams.set("productUrl", productUrl);
    }

    const response = await fetch(
      `${getWidgetApiBaseUrl()}/api/v1/widget/productDetails?${searchParams.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return null;
    }

    return normalizeProductDetailsPayload(parseApiPayload(payload));
  } catch {
    return null;
  }
}

async function fetchShopifyProductDetails(
  product: ProductCardData,
  signal?: AbortSignal
): Promise<ProductDetailsResult | null> {
  const productJsonUrl = getShopifyProductJsonUrl(product.productUrl);
  if (!productJsonUrl) {
    return null;
  }

  try {
    const response = await fetch(productJsonUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as Record<string, unknown>;
    const resolved = mapShopifyProductJson(json, product.productUrl);
    if (!resolved) {
      return null;
    }

    return {
      product: {
        ...product,
        ...resolved,
        name: resolved.name || product.name,
        imageUrl: resolved.imageUrl || product.imageUrl,
        price: resolved.price || product.price,
      },
      recommendations: [],
    };
  } catch {
    return null;
  }
}

function mergeProductDetails(
  base: ProductCardData,
  fetched: ProductCardData
): ProductCardData {
  return {
    ...base,
    ...fetched,
    id: fetched.id ?? base.id,
    name: isValidProductDetailName(fetched.name, base.name),
    imageUrl: fetched.imageUrl || base.imageUrl,
    price: fetched.price || base.price,
    productUrl: fetched.productUrl || base.productUrl,
    description: fetched.description || base.description,
    category: fetched.category || base.category,
    sizes: fetched.sizes?.length ? fetched.sizes : base.sizes,
  };
}

function isMetadataLine(line: string): boolean {
  return /^(?:Title|Name|Price|Description|Availability|Colors?\s+Available|Available\s+Colors?|Category|Image(?:\s+URL)?|Product\s+URL|URL|Product\s+ID|Actions):/i.test(
    line.trim()
  );
}

function isIntroLine(line: string): boolean {
  return /^here are (?:the )?details/i.test(line.trim());
}

export function isValidProductDetailName(
  name: string | undefined,
  fallback: string
): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return fallback;
  }

  if (
    isMetadataLine(trimmed) ||
    /^available colors?:/i.test(trimmed) ||
    trimmed.length > 80
  ) {
    return fallback;
  }

  return trimmed;
}

function isValidColorName(color: string): boolean {
  const trimmed = color.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 24 &&
    !/[()]/.test(trimmed) &&
    !/^(?:and|or|with|the|is|currently|selected|available)$/i.test(trimmed)
  );
}

function parseAvailableColors(value: string): {
  colors: string[];
  note?: string;
} {
  const noteMatch = value.match(/\(([^)]+)\)\s*$/);
  const note = noteMatch?.[1]?.trim();
  const colorPart = value.replace(/\([^)]+\)\s*$/g, "").trim();
  const colors = colorPart
    .split(/,\s*/)
    .map(color => color.trim())
    .filter(isValidColorName);

  return { colors, note: note || undefined };
}

function formatDescriptionParts(parts: string[]): string {
  if (parts.length === 0) {
    return "";
  }

  const allBullets = parts.every(part => /^[-*•]\s/.test(part.trim()));
  if (allBullets) {
    return parts.map(part => part.trim()).join("\n");
  }

  return parts.join("\n\n").trim();
}

function extractImageUrlFromDetailLine(line: string): string | undefined {
  const match = line.match(
    /^(?:Image(?:\s+URL)?|URL|Product\s+URL):\s*(https?:\/\/\S+)/i
  );
  return match?.[1]?.replace(/\s*\[blocked\].*$/i, "").trim();
}

export function looksLikeMarkdownMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  return (
    /^#{1,6}\s+/m.test(trimmed) ||
    /```/.test(trimmed) ||
    /^>\s+/m.test(trimmed) ||
    /^\|.+\|.+\|/m.test(trimmed) ||
    /^!\[[^\]]*\]\([^)]+\)/m.test(trimmed) ||
    /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(trimmed) ||
    /^\d+\.\s+.+/m.test(trimmed) ||
    /\*\*[^*]+\*\*/.test(trimmed) ||
    /(?:^|\s)`[^`\n]+`(?:\s|$)/.test(trimmed)
  );
}

export function isProductDetailStructuredMessage(message: string): boolean {
  const trimmed = normalizeProductMessage(message).trim();
  if (!trimmed || looksLikeMarkdownMessage(trimmed)) {
    return false;
  }

  const titleMatches = trimmed.match(/(?:^|\n)Title:\s/gim) ?? [];
  const titleCount = titleMatches.length;

  // Multiple Title blocks are product catalog listings, not single-product details.
  if (titleCount > 1) {
    return false;
  }

  if (messageHasStructuredProducts(trimmed)) {
    return /here are (?:the )?details/i.test(trimmed);
  }

  if (/here are (?:the )?details/i.test(trimmed)) {
    return true;
  }

  const lines = trimmed
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter(line => /^[-*•]\s+/.test(line));
  if (bulletLines.length >= 2) {
    const listingBullets = bulletLines.filter(line =>
      /Price:\s|(?:Image(?:\s+URL)?|URL|Product\s+URL):\s*https?:\/\//i.test(
        line
      )
    );
    if (listingBullets.length === 0) {
      return true;
    }
  }

  if (
    titleCount === 0 &&
    /^(?:Price|Description|Available\s+Colors?):/im.test(trimmed)
  ) {
    return true;
  }

  return false;
}

export function mergeProductDescriptions(
  base?: string,
  additional?: string
): string | undefined {
  const baseTrimmed = base?.trim();
  const additionalTrimmed = additional?.trim();

  if (!additionalTrimmed) {
    return baseTrimmed;
  }

  if (!baseTrimmed) {
    return additionalTrimmed;
  }

  const normalizedBase = baseTrimmed.toLowerCase();
  const normalizedAdditional = additionalTrimmed.toLowerCase();

  if (normalizedBase.includes(normalizedAdditional)) {
    return baseTrimmed;
  }

  if (normalizedAdditional.includes(normalizedBase)) {
    return additionalTrimmed;
  }

  return `${baseTrimmed}\n\n${additionalTrimmed}`;
}

export function stripExpandedCardMetadataFromDescription(
  description: string | undefined
): string | undefined {
  if (!description?.trim()) {
    return description;
  }

  const cleaned = description
    .split("\n")
    .map(line => stripProductUrlsFromText(line.trim()))
    .filter(line => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !/^(?:Colors?\s+Available|Available\s+Colors?|Availability|Image(?:\s+URL)?|Product\s+URL|URL|Price|Product\s+Page):/i.test(
          trimmed
        ) &&
        !/^https?:\/\//.test(trimmed)
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return stripConversationalTail(cleaned) || undefined;
}

function stripProductUrlsFromText(text: string): string {
  return text
    .replace(
      /^(?:Product\s+Page|Product\s+URL|URL):\s*https?:\/\/\S+\s*/gim,
      ""
    )
    .replace(/\bhttps?:\/\/\S+/g, "")
    .replace(/\s*\[blocked\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripConversationalTail(text: string): string {
  return text
    .replace(
      /\s*(Would you like[\s\S]*|If yes,[\s\S]*|please let me know[\s\S]*)$/i,
      ""
    )
    .trim();
}

function isConversationalLine(line: string): boolean {
  return /^(?:Would you like|If yes|please let me know)/i.test(line.trim());
}

function isColorOptionsLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(?:You can choose from these )?color options?:/i.test(trimmed) ||
    /choose from (?:these )?color/i.test(trimmed) ||
    /^available colors?:/i.test(trimmed)
  );
}

function isAvailabilityMetadataLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^availability:/i.test(trimmed) ||
    /^(?:in stock|out of stock|available now|sold out)\.?$/i.test(trimmed)
  );
}

function splitFeatureList(sentence: string): string[] {
  const trimmed = sentence.replace(/\.\s*$/, "").trim();
  if (!trimmed) {
    return [];
  }

  const featurePrefix = trimmed.match(
    /^(?:It features|Features include|Featuring|Includes)\s+(.+)$/i
  );
  if (featurePrefix?.[1]) {
    return featurePrefix[1]
      .split(/,\s*(?:and\s+)?/i)
      .map(part => part.trim())
      .filter(Boolean);
  }

  if (/^Made from\s+/i.test(trimmed) && trimmed.includes(",")) {
    return trimmed
      .split(/,\s*(?:and\s+)?/i)
      .map(part => part.replace(/^with\s+/i, "").trim())
      .filter(Boolean);
  }

  return [trimmed];
}

export function formatExpandedProductDescription(
  description: string | undefined,
  options?: { omitAvailabilityLines?: boolean }
): string[] {
  if (!description?.trim()) {
    return [];
  }

  let text = stripProductUrlsFromText(description);
  text = stripConversationalTail(text);
  if (!text) {
    return [];
  }

  const lines = text
    .split("\n")
    .map(line => stripProductUrlsFromText(line.trim()))
    .filter(
      line =>
        line &&
        !isConversationalLine(line) &&
        !isColorOptionsLine(line) &&
        !(options?.omitAvailabilityLines && isAvailabilityMetadataLine(line))
    );

  const bulletLines = lines.filter(line => /^[-*•]\s/.test(line));
  if (bulletLines.length > 0) {
    return bulletLines
      .map(line => line.replace(/^[-*•]\s+/, "").trim())
      .filter(Boolean);
  }

  const paragraph = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!paragraph) {
    return [];
  }

  const bullets: string[] = [];
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence && !isConversationalLine(sentence));

  for (const sentence of sentences) {
    const parts = splitFeatureList(sentence);
    bullets.push(...parts);
  }

  return bullets.filter(
    bullet => bullet.length > 2 && !isColorOptionsLine(bullet)
  );
}

export function parseAgentProductDetailContent(
  message: string,
  baseProduct: ProductCardData
): {
  name: string;
  price?: string;
  description?: string;
  colors: string[];
  imageUrl?: string;
  availability?: string;
} {
  const fallbackName = isValidProductDetailName(baseProduct.name, "Product");
  const trimmedMessage = normalizeProductMessage(message).trim();
  if (!trimmedMessage) {
    return {
      name: fallbackName,
      price: baseProduct.price,
      description: baseProduct.description,
      colors: [],
      imageUrl: baseProduct.imageUrl,
      availability: undefined,
    };
  }

  let name = fallbackName;
  let price = baseProduct.price;
  let imageUrl = baseProduct.imageUrl;
  let availability: string | undefined;
  const colors: string[] = [];
  const descriptionParts: string[] = [];

  for (const line of trimmedMessage.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || isIntroLine(trimmed)) {
      continue;
    }

    if (/^(?:Title|Name):\s*/i.test(trimmed)) {
      name = isValidProductDetailName(
        trimmed.replace(/^(?:Title|Name):\s*/i, "").trim(),
        fallbackName
      );
      continue;
    }

    if (/^Price:\s*/i.test(trimmed)) {
      price = trimmed.replace(/^Price:\s*/i, "").trim() || price;
      continue;
    }

    const imageFromLine = extractImageUrlFromDetailLine(trimmed);
    if (imageFromLine) {
      imageUrl = imageFromLine;
      continue;
    }

    if (/^Description:\s*/i.test(trimmed)) {
      const value = trimmed.replace(/^Description:\s*/i, "").trim();
      if (value) {
        descriptionParts.push(value);
      }
      continue;
    }

    if (/^Available\s+Colors?:\s*/i.test(trimmed)) {
      const value = trimmed.replace(/^Available\s+Colors?:\s*/i, "").trim();
      const parsedColors = parseAvailableColors(value);
      colors.push(...parsedColors.colors);
      if (parsedColors.note) {
        descriptionParts.push(parsedColors.note);
      }
      continue;
    }

    if (/^Colors?\s+Available:\s*/i.test(trimmed)) {
      const value = trimmed.replace(/^Colors?\s+Available:\s*/i, "").trim();
      const parsedColors = parseAvailableColors(value);
      colors.push(...parsedColors.colors);
      continue;
    }

    if (/^Availability:\s*/i.test(trimmed)) {
      availability =
        trimmed.replace(/^Availability:\s*/i, "").trim() || availability;
      continue;
    }

    if (isMetadataLine(trimmed)) {
      continue;
    }

    descriptionParts.push(trimmed);
  }

  let description = formatDescriptionParts(descriptionParts);
  if (!description) {
    description = extractAgentProductDetailText(trimmedMessage);
  }

  return {
    name,
    price,
    description: stripExpandedCardMetadataFromDescription(
      mergeProductDescriptions(baseProduct.description, description)
    ),
    colors,
    imageUrl,
    availability,
  };
}

export function extractAgentProductDetailText(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  const withoutProducts = messageHasStructuredProducts(trimmed)
    ? extractIntroBeforeStructuredProducts(trimmed)
    : trimmed;

  return withoutProducts
    .replace(/^here are (?:the )?details(?: for)?[^:\n]*:\s*/gim, "")
    .replace(
      /^here are the details for each available color variant[^:\n]*:\s*/gim,
      ""
    )
    .replace(
      /^(?:Image(?:\s+URL)?|Product\s+URL|URL):\s*https?:\/\/\S+\s*/gim,
      ""
    )
    .replace(/\nActions:\s*\n(?:[-*•]\s*[^\n]+\n?)*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getRequestedProductNameFromDetailMessage(
  message: string,
  displayMessage?: string
): string | null {
  const text = getUserMessageDisplayText(message, displayMessage);
  const match = text.match(/^i need more details about (.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function isProductDetailAgentResponse(
  entry: DisplayTranscriptEntry,
  entries: DisplayTranscriptEntry[],
  entryIndex: number
): boolean {
  if (entry.type !== "message" || entry.role !== "agent") {
    return false;
  }

  for (let index = entryIndex - 1; index >= 0; index -= 1) {
    const previous = entries[index];
    if (previous.type !== "message") {
      continue;
    }

    if (
      previous.role === "user" &&
      isProductDetailsRequestMessage(previous.message, previous.displayMessage)
    ) {
      return true;
    }

    if (previous.role === "agent") {
      return false;
    }
  }

  return false;
}

export function getProductDetailAgentReplyText(message: string): string {
  const trimmed = normalizeProductMessage(message).trim();
  if (!trimmed) {
    return "";
  }

  const conversational: string[] = [];

  for (const block of trimmed.split(/\n\n+/)) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) {
      continue;
    }

    const lines = trimmedBlock
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
    const firstLine = lines[0] ?? "";

    if (
      /^(?:Title|Name|Price|Description|Available\s+Colors?|Image|Product\s+URL|URL|Here are (?:the )?details)/i.test(
        firstLine
      ) ||
      lines.every(
        line =>
          isMetadataLine(line) || /^Price:|^Available|^Image|^URL:/i.test(line)
      )
    ) {
      continue;
    }

    if (lines.every(line => /^[-*•]\s+/.test(line))) {
      continue;
    }

    if (/^[-*•]\s*(?:View details|Add to cart)/i.test(trimmedBlock)) {
      continue;
    }

    conversational.push(trimmedBlock);
  }

  return conversational.join("\n\n").trim();
}

export function shouldHideProductDetailAgentEntry(
  entry: DisplayTranscriptEntry,
  entries: DisplayTranscriptEntry[],
  entryIndex: number
): boolean {
  if (entry.type !== "message" || entry.role !== "agent") {
    return false;
  }

  for (let index = entryIndex - 1; index >= 0; index -= 1) {
    const previous = entries[index];
    if (previous.type !== "message") {
      continue;
    }

    if (
      previous.role === "user" &&
      isProductDetailsRequestMessage(previous.message, previous.displayMessage)
    ) {
      return Boolean(extractAgentProductDetailText(entry.message));
    }

    if (previous.role === "agent") {
      return false;
    }
  }

  return false;
}

export function findExpandedProductForDetailRequest(
  entries: DisplayTranscriptEntry[],
  entryIndex: number
): ProductCardData | null {
  for (let index = entryIndex - 1; index >= 0; index -= 1) {
    const previous = entries[index];
    if (previous.type !== "message") {
      continue;
    }

    if (
      previous.role === "user" &&
      isProductDetailsRequestMessage(previous.message, previous.displayMessage)
    ) {
      const displayText = getUserMessageDisplayText(
        previous.message,
        previous.displayMessage
      );
      const nameMatch = displayText.match(/^i need more details about (.+)$/i);
      const name = nameMatch?.[1]?.trim();
      if (!name) {
        return null;
      }

      return withProductDisplayName({ name });
    }

    if (previous.role === "agent") {
      return null;
    }
  }

  return null;
}

export function findAgentDetailResponseAfterRequest(
  entries: TranscriptEntry[],
  fromIndex: number
): string | null {
  let awaitingAgent = false;

  for (let index = fromIndex; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.type !== "message") {
      continue;
    }

    if (
      entry.role === "user" &&
      isProductDetailsRequestMessage(entry.message, entry.displayMessage)
    ) {
      awaitingAgent = true;
      continue;
    }

    if (!awaitingAgent || entry.role !== "agent") {
      continue;
    }

    const detailText = extractAgentProductDetailText(entry.message);
    if (!detailText && entry.isStreaming) {
      return null;
    }

    return detailText || null;
  }

  return null;
}

export async function resolveProductDetails(
  product: ProductCardData,
  params: WidgetProductDetailsParams,
  signal?: AbortSignal
): Promise<ProductDetailsResult> {
  const remote = await fetchWidgetProductDetails(
    {
      ...params,
      productId: params.productId ?? product.id,
      imageUrl: params.imageUrl ?? product.imageUrl,
      productName: params.productName ?? product.name,
      productUrl: params.productUrl ?? product.productUrl,
    },
    signal
  );

  if (remote) {
    return {
      product: mergeProductDetails(product, remote.product),
      recommendations: remote.recommendations,
    };
  }

  const shopify = await fetchShopifyProductDetails(product, signal);
  if (shopify) {
    return shopify;
  }

  return {
    product,
    recommendations: [],
  };
}
