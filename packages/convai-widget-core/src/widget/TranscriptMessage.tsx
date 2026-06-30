import { clsx } from "clsx";
import { useSignal } from "@preact/signals";
import { useRef, useEffect } from "preact/hooks";
import { Feedback } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { InOutTransition } from "../components/InOutTransition";
import { useAvatarConfig } from "../contexts/avatar-config";
import { useConversation } from "../contexts/conversation";
import {
  ToolCallStatus,
  type DisplayTranscriptEntry,
  type ToolCallStatusType,
} from "../utils/display-transcript";
import { useTextContents } from "../contexts/text-contents";
import {
  useMarkdownLinkConfig,
  useEndFeedbackType,
  useWidgetConfig,
  useBusinessModeFeatures,
} from "../contexts/widget-config";
import { stripAudioTags } from "../utils/stripAudioTags";
import { WidgetStreamdown } from "../markdown";
import { isImageMimeType } from "./useFileUpload";
import { useProductCart } from "../contexts/product-cart";
import { useSheetContent } from "../contexts/sheet-content";
import type { ProductCardData } from "../types/product-card";
import { ProductExpandedCard } from "./ProductExpandedCard";
import {
  buildProductDetailsRequestMessages,
  extractProductIdFromRecord,
  extractProductIdFromText,
  getProductDisplayName,
  getUserMessageDisplayText,
  isProductDetailsRequestMessage,
  withProductDisplayName,
} from "../utils/product-display";
import {
  extractIntroBeforeStructuredProducts,
  isProductActionBullet,
  classifyProductUrl,
  messageHasStructuredProducts,
  parseStructuredProductBlocks,
  extractSizesFromRecord,
} from "../utils/product-message-parse";
import {
  extractAgentProductDetailText,
  getProductDetailAgentReplyText,
  getRequestedProductNameFromDetailMessage,
  isProductDetailAgentResponse,
  isProductDetailStructuredMessage,
  looksLikeMarkdownMessage,
  parseAgentProductDetailContent,
} from "../utils/product-details";
import {
  cleanAgentUrl,
  formatCheckoutAgentMessage,
} from "../utils/agent-response";
import { isCheckoutFlowStep, isAgentReplyAfterAddToCart } from "../utils/checkout";
import { formatProductPriceForDisplay } from "../utils/product-price-display";

interface TranscriptMessageProps {
  entry: DisplayTranscriptEntry;
  entryIndex: number;
  entries: DisplayTranscriptEntry[];
  animateIn: boolean;
}

type ProductCard = ProductCardData;

function productsMatch(a: ProductCard, b: ProductCard): boolean {
  if (a.id && b.id && a.id === b.id) {
    return true;
  }
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
}

function extractPriceFromObject(value: Record<string, unknown>): string | undefined {
  const directPrice = firstNonEmptyString(
    value.price,
    value.sale_price,
    value.salePrice,
    value.offer_price,
    value.offerPrice,
    value.mrp
  );
  if (directPrice) {
    return directPrice;
  }

  const numericPrice =
    typeof value.price === "number"
      ? value.price
      : typeof value.amount === "number"
        ? value.amount
        : typeof value.sale_price === "number"
          ? value.sale_price
          : typeof value.salePrice === "number"
            ? value.salePrice
            : undefined;
  if (numericPrice == null) {
    return undefined;
  }

  const currencySymbol = firstNonEmptyString(
    value.currency_symbol,
    value.currencySymbol
  );
  const currencyCode = firstNonEmptyString(value.currency, value.currency_code);
  if (currencySymbol) {
    return `${currencySymbol}${numericPrice}`;
  }
  if (currencyCode) {
    return `${currencyCode} ${numericPrice}`;
  }
  return String(numericPrice);
}

function extractCategoryFallback(value: string): string | undefined {
  return value.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
}

function extractDescriptionFallback(
  value: string,
  price: string | undefined
): string | undefined {
  if (!price) {
    return undefined;
  }

  const parts = value
    .split(/\s+[—-]\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const priceIndex = parts.findIndex(part => part.includes(price));
  if (priceIndex === -1) {
    return undefined;
  }

  return (
    parts[priceIndex + 1]
      ?.replace(/\s*\([^()]+\)\s*$/, "")
      .trim() || undefined
  );
}

function extractImageUrl(value: string): string | undefined {
  return value
    .match(/(?:Image(?:\s*URL)?|Photo|Picture|Thumbnail|Link|URL):\s*(https?:\/\/\S+)/i)?.[1]
    ?.replace(/\s*\[blocked\]$/i, "")
    .trim();
}

function parseMultilineProduct(block: string): ProductCard | null {
  const lines = block
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  const cleanedLines = lines.map(line =>
    line
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^[-*•]\s+/, "")
      .trim()
  );
  const titleLine = cleanedLines[0]
    .replace(/^Name:\s*/i, "")
    .trim();
  const metadataLine = cleanedLines.slice(1).join(" ");

  const name = firstNonEmptyString(
    titleLine,
    cleanedLines.find(line => /^Name:/i.test(line))?.replace(/^Name:\s*/i, "")
  );
  const price = firstNonEmptyString(
    cleanedLines.find(line => /^Price:/i.test(line))?.replace(/^Price:\s*/i, ""),
    metadataLine.match(/Price:\s*([$€£₹]\s?\d[\d,.]*)/i)?.[1],
    extractPriceFromObject({ price: metadataLine.match(/([$€£₹]\s?\d[\d,.]*)/)?.[1] })
  );
  const description = firstNonEmptyString(
    cleanedLines
      .find(line => /^Description:/i.test(line))
      ?.replace(/^Description:\s*/i, ""),
    metadataLine.match(/Description:\s*(.*?)(?=Category:|Image:|URL:|$)/i)?.[1],
    extractDescriptionFallback(metadataLine, price)
  );
  const category = firstNonEmptyString(
    cleanedLines.find(line => /^Category:/i.test(line))?.replace(/^Category:\s*/i, ""),
    metadataLine.match(/Category:\s*(.*?)(?=Description:|Image:|URL:|$)/i)?.[1],
    extractCategoryFallback(metadataLine)
  );
  const imageUrl = firstNonEmptyString(
    cleanedLines.find(line => /^(?:Image(?:\s*URL)?|Photo|Picture|Thumbnail|Link|URL):/i.test(line)),
    extractImageUrl(metadataLine)
  )?.replace(/^(?:Image(?:\s*URL)?|Photo|Picture|Thumbnail|Link|URL):\s*/i, "");
  const id = firstNonEmptyString(
    cleanedLines
      .find(line => /^Product\s+ID:/i.test(line))
      ?.replace(/^Product\s+ID:\s*/i, ""),
    extractProductIdFromText(metadataLine),
    extractProductIdFromText(titleLine)
  );

  return name
    ? withProductDisplayName({
        id,
        name,
        price,
        imageUrl,
        description,
        category,
      })
    : null;
}

function parseSingleLineProduct(line: string): ProductCard | null {
  if (!line) {
    return null;
  }

  const multilineProduct = parseMultilineProduct(line);
  if (multilineProduct) {
    return multilineProduct;
  }

  const normalized = line.replace(/\s+/g, " ").trim();

  const nameMatch = normalized.match(
    /^(?:\d+[.)]\s*)?(?:Name:\s*)?(.+?)(?=\s+(?:URL|Image|Price|Description|Category):|$)/i
  );
  const urlMatch = normalized.match(
    /(?:URL|Image):\s*(https?:\/\/\S+?)(?:\s+\[blocked\])?(?=\s+(?:Price|Description|Category):|$)/i
  );
  const priceMatch = normalized.match(/Price:\s*([$€£₹]\s?\d[\d,.]*)/i);
  const descriptionMatch = normalized.match(/Description:\s*(.*?)(?=(?:Category|URL|Image|$))/i);

  const name = firstNonEmptyString(nameMatch?.[1]);
  const imageUrl = firstNonEmptyString(urlMatch?.[1]);
  const price = firstNonEmptyString(priceMatch?.[1]);
  const description = firstNonEmptyString(descriptionMatch?.[1]);

  if (name) {
    const id = extractProductIdFromText(normalized);
    return withProductDisplayName({
      id,
      name,
      price,
      imageUrl,
      description,
    });
  }

  // Fallback to old parsing logic
  const imageUrl2 = extractImageUrl(normalized);
  const description2 = normalized.match(/Description:\s*(.*?)(?=Category:|Image:|$)/i);
  const category = normalized.match(/Category:\s*(.*?)(?=Description:|Image:|$)/i);
  const mainSegment =
    normalized.split(/Category:|Description:|Image:/i)[0]?.trim() ?? "";
  const dashedMatch = mainSegment.match(/^(.*?)\s+[—-]\s+(.+)$/);
  const priceMatch2 = normalized.match(/([$€£₹]\s?\d[\d,.]*)/);
  let name2 = mainSegment;
  let price2: string | undefined;

  if (priceMatch2) {
    price2 = priceMatch2[1].trim();
    name2 = normalized
      .slice(0, priceMatch2.index)
      .replace(/[—-]\s*$/, "")
      .trim();
  } else if (dashedMatch) {
    name2 = dashedMatch[1].trim();
    price2 = dashedMatch[2].trim();
  }

  name2 = name2.replace(/[—-]\s*$/, "").trim();
  if (price2) {
    price2 = price2
      .split(/Description:|Category:|Image:/i)[0]
      .replace(/[—-]\s*$/, "")
      .trim();
  }

  return name2
    ? withProductDisplayName({
        id: extractProductIdFromText(normalized),
        name: name2,
        price: price2,
        imageUrl: imageUrl2,
        description:
          description2?.[1]?.trim() || extractDescriptionFallback(normalized, price2),
        category: category?.[1]?.trim() || extractCategoryFallback(normalized),
      })
    : null;
}

function extractProductArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  for (const key of ["products", "items", "results", "catalog", "data", "product_cards"]) {
    const nestedValue = record[key];
    if (Array.isArray(nestedValue)) {
      return nestedValue;
    }
    if (nestedValue && typeof nestedValue === "object") {
      const nestedArray = extractProductArray(nestedValue);
      if (nestedArray.length > 0) {
        return nestedArray;
      }
    }
  }
  return [];
}

function parseProductObject(value: unknown): ProductCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = firstNonEmptyString(
    record.name,
    record.title,
    record.product_name,
    record.productName,
    record.label
  );
  const price = extractPriceFromObject(record);
  const rawProductUrl = firstNonEmptyString(
    record.product_url,
    record.productUrl,
    record.link,
    record.url,
    record.href
  );
  const classifiedUrl = classifyProductUrl(
    rawProductUrl ? cleanAgentUrl(rawProductUrl) : undefined
  );
  const imageUrl =
    firstNonEmptyString(
      record.image_url,
      record.imageUrl,
      record.image,
      record.img,
      record.photo,
      record.picture,
      record.thumbnail,
      record.thumbnail_url,
      record.thumbnailUrl,
      Array.isArray(record.images) ? record.images[0] : undefined,
      Array.isArray(record.image_urls) ? record.image_urls[0] : undefined
    ) ?? classifiedUrl.imageUrl;
  const productUrl = classifiedUrl.productUrl;
  const description = firstNonEmptyString(
    record.description,
    record.summary,
    record.subtitle,
    record.details
  );
  const category = firstNonEmptyString(
    record.category,
    record.type,
    record.collection,
    record.department
  );
  const id = firstNonEmptyString(
    extractProductIdFromRecord(record),
    productUrl ? extractProductIdFromText(productUrl) : undefined,
    name ? extractProductIdFromText(name) : undefined
  );
  const displayName = name ? getProductDisplayName(name) : undefined;
  const sizes = extractSizesFromRecord(record);

  if (!displayName && !price && !imageUrl && !description && !category) {
    return null;
  }

  return withProductDisplayName({
    id,
    name: displayName ?? "Product",
    price,
    imageUrl,
    productUrl,
    description,
    category,
    sizes,
  });
}

function parseProductsFromToolResult(toolResult: string | undefined): ProductCard[] {
  if (!toolResult) {
    return [];
  }

  try {
    return extractProductArray(JSON.parse(toolResult))
      .map(parseProductObject)
      .filter((product): product is ProductCard => product !== null);
  } catch {
    return [];
  }
}

function isProductMetadataLine(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[-*•]\s+/.test(trimmed) ||
    /^(Category:|Description:|Image:)/i.test(trimmed) ||
    /([$€£₹]\s?\d[\d,.]*)/.test(trimmed)
  );
}

function trailingNonProductText(value: string): string {
  const blocks = value
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) {
    return "";
  }

  const tail = blocks[blocks.length - 1];
  return isProductMetadataLine(tail) ? "" : tail;
}

function parseNumberedProducts(message: string): {
  products: ProductCard[];
  cleanedMessage: string;
  introMessage: string;
  outroMessage: string;
} {
  const matches = Array.from(message.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+/g));
  if (matches.length === 0) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  const introMessage = message.slice(0, matches[0].index).trim();
  const products: ProductCard[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index + current[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : message.length;
    const block = message.slice(start, end).trim();
    const product = parseMultilineProduct(block) ?? parseSingleLineProduct(block);
    if (product) {
      products.push(product);
    }
  }

  if (products.length === 0) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  const lastProductStart =
    matches[matches.length - 1].index + matches[matches.length - 1][0].length;
  const outroMessage = trailingNonProductText(
    message.slice(lastProductStart).trim()
  );

  return {
    products,
    introMessage,
    outroMessage,
    cleanedMessage: [introMessage, outroMessage].filter(Boolean).join("\n\n"),
  };
}

function isProductListingBulletLine(line: string): boolean {
  const content = line.replace(/^[-*•]\s+/, "").trim();
  if (!content || isProductActionBullet(line)) {
    return false;
  }

  if (/^(?:Title|Name|Price|Description|Available|Image|URL|Category|Product\s+ID):/i.test(content)) {
    return false;
  }

  return (
    /Price:\s*(?:[$€£₹]|Rs\.?)/i.test(content) ||
    /(?:Image(?:\s+URL)?|URL|Product\s+URL):\s*https?:\/\//i.test(content)
  );
}

function parseBulletProducts(message: string): {
  products: ProductCard[];
  cleanedMessage: string;
  introMessage: string;
  outroMessage: string;
} {
  const lines = message.split(/\n/).map(line => line.trim());
  const bulletLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^[-*•]\s+/.test(line))
    .filter(({ line }) => !isProductActionBullet(line))
    .filter(({ line }) => isProductListingBulletLine(line));
  if (bulletLines.length === 0) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  const products = bulletLines
    .map(({ line }) => parseSingleLineProduct(line.replace(/^[-*•]\s+/, "")))
    .filter((product): product is ProductCard => product !== null);
  if (products.length === 0) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  const firstIndex = bulletLines[0].index;
  const lastIndex = bulletLines[bulletLines.length - 1].index;
  const introMessage = lines.slice(0, firstIndex).filter(Boolean).join("\n").trim();
  const outroMessage = lines.slice(lastIndex + 1).filter(Boolean).join("\n").trim();

  return {
    products,
    introMessage,
    outroMessage,
    cleanedMessage: [introMessage, outroMessage].filter(Boolean).join("\n\n"),
  };
}

function parseProductsFromMessage(message: string): {
  products: ProductCard[];
  cleanedMessage: string;
  introMessage: string;
  outroMessage: string;
} {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  if (looksLikeMarkdownMessage(trimmed)) {
    return {
      products: [],
      cleanedMessage: message,
      introMessage: "",
      outroMessage: "",
    };
  }

  if (isProductDetailStructuredMessage(trimmed)) {
    return {
      products: [],
      cleanedMessage: "",
      introMessage: "",
      outroMessage: getProductDetailAgentReplyText(trimmed),
    };
  }

  const structured = parseStructuredProductBlocks(trimmed);
  if (structured.products.length > 0) {
    return structured;
  }

  const numbered = parseNumberedProducts(trimmed);
  if (numbered.products.length > 0) {
    return numbered;
  }

  const bulleted = parseBulletProducts(trimmed);
  if (bulleted.products.length > 0) {
    return bulleted;
  }

  return {
    products: [],
    cleanedMessage: message,
    introMessage: "",
    outroMessage: "",
  };
}

const DEFAULT_PRODUCT_SKELETON_COUNT = 3;

function messageExpectsProducts(message: string): boolean {
  if (
    isProductDetailStructuredMessage(message) ||
    looksLikeMarkdownMessage(message)
  ) {
    return false;
  }

  return (
    messageHasStructuredProducts(message) ||
    /(?:^|\n)\s*Title:\s*.+\n\s*Price:/im.test(message) ||
    /(?:^|\n)\s*\d+[.)]\s+/.test(message) ||
    /"products"\s*:\s*\[/.test(message)
  );
}

function extractIntroMessage(message: string): string {
  if (messageHasStructuredProducts(message)) {
    return extractIntroBeforeStructuredProducts(message);
  }

  const numberedMatch = message.match(/(?:^|\n)\s*\d+[.)]\s+/);
  if (numberedMatch?.index != null) {
    if (numberedMatch.index > 0) {
      return message.slice(0, numberedMatch.index).trim();
    }
    return "";
  }

  const bulletMatch = message.match(/(?:^|\n)\s*[-*•]\s+/);
  if (bulletMatch?.index != null) {
    if (bulletMatch.index > 0) {
      return message.slice(0, bulletMatch.index).trim();
    }
    return "";
  }

  const jsonStart = message.indexOf("{");
  if (jsonStart > 0 && /"products"\s*:\s*\[/.test(message)) {
    return message.slice(0, jsonStart).trim();
  }
  if (jsonStart === 0 && /"products"\s*:\s*\[/.test(message)) {
    return "";
  }

  return message;
}

type AgentProductDisplay = {
  products: ProductCard[];
  message: string;
  outroMessage: string;
  showProducts: boolean;
  showProductSkeletons: boolean;
  skeletonCount: number;
  showBreadcrumb: boolean;
  showToolStatus: boolean;
};

function resolveAgentProductDisplay(
  entry: Extract<DisplayTranscriptEntry, { type: "message" }>,
  displayMessage: string,
  showProductCards: boolean
): AgentProductDisplay {
  const toolResultProducts = parseProductsFromToolResult(entry.toolResult);
  const isToolPending = entry.toolStatus === ToolCallStatus.LOADING;
  const isStreaming = entry.isStreaming === true;
  const expectsProducts =
    isToolPending ||
    toolResultProducts.length > 0 ||
    messageExpectsProducts(displayMessage);

  if (
    showProductCards &&
    expectsProducts &&
    (isStreaming || isToolPending)
  ) {
    const intro = extractIntroMessage(displayMessage);
    return {
      products: [],
      message: intro || displayMessage,
      outroMessage: "",
      showProducts: false,
      showProductSkeletons: true,
      skeletonCount: DEFAULT_PRODUCT_SKELETON_COUNT,
      showBreadcrumb: true,
      showToolStatus: false,
    };
  }

  if (isStreaming || isToolPending) {
    return {
      products: [],
      message: displayMessage,
      outroMessage: "",
      showProducts: false,
      showProductSkeletons: false,
      skeletonCount: 0,
      showBreadcrumb: false,
      showToolStatus: Boolean(entry.toolStatus),
    };
  }

  const parsedMessage =
    toolResultProducts.length === 0
      ? parseProductsFromMessage(displayMessage)
      : {
          products: [],
          cleanedMessage: displayMessage,
          introMessage: displayMessage,
          outroMessage: "",
        };
  const products =
    toolResultProducts.length > 0
      ? toolResultProducts
      : parsedMessage.products;
  const showProducts = showProductCards && products.length > 0;

  return {
    products,
    message: showProducts ? parsedMessage.introMessage : displayMessage,
    outroMessage: showProducts ? parsedMessage.outroMessage : "",
    showProducts,
    showProductSkeletons: false,
    skeletonCount: 0,
    showBreadcrumb: showProducts,
    showToolStatus: Boolean(entry.toolStatus) && !showProducts,
  };
}

function ProductCardSkeleton({ showImages }: { showImages: boolean }) {
  return (
    <article className="product-card product-card-skeleton" aria-hidden="true">
      {showImages && <div className="product-card-media product-card-media-skeleton" />}
      <div className="product-card-content flex flex-col gap-1 p-3">
        <div className="product-card-skeleton-line h-3 w-[82%] rounded-sm" />
        <div className="product-card-skeleton-line h-3 w-[42%] rounded-sm" />
        <div className="flex items-center gap-1.5 pt-1">
          <div className="product-card-skeleton-line h-8 w-8 shrink-0 rounded-[9px]" />
          <div className="product-card-skeleton-line h-8 min-w-0 flex-1 rounded-[9px]" />
        </div>
      </div>
    </article>
  );
}

function ProductCardSkeletons({
  count,
  showImages,
}: {
  count: number;
  showImages: boolean;
}) {
  return (
    <div className="product-card-carousel w-full max-w-full">
      <div className="product-card-track">
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={`skeleton-${index}`} showImages={showImages} />
        ))}
      </div>
    </div>
  );
}

function ProductCards({
  products,
  showImages,
  showCartActions,
}: {
  products: ProductCard[];
  showImages: boolean;
  showCartActions: boolean;
}) {
  const cart = useProductCart();
  const { activeProduct, openProductDetail, closeProductDetail } = useSheetContent();
  const { isDisconnected, sendUserMessage, startSession } = useConversation();
  const visibleProducts = products;
  const activeIndex = useSignal(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const expandedProduct = activeProduct.value;
  const matchedExpandedProduct =
    expandedProduct &&
    visibleProducts.find(product => productsMatch(product, expandedProduct));

  const scrollToIndex = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, visibleProducts.length - 1));
    activeIndex.value = nextIndex;
    listRef.current?.children[nextIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
  };

  if (visibleProducts.length === 0) {
    return null;
  }

  const handleViewDetails = (product: ProductCard) => {
    if (matchedExpandedProduct && productsMatch(product, matchedExpandedProduct)) {
      closeProductDetail();
      return;
    }

    openProductDetail(product);
    const { displayText, backendText } = buildProductDetailsRequestMessages(product);

    void (async () => {
      if (isDisconnected.peek()) {
        await startSession(document.body, backendText, { displayText });
        return;
      }
      sendUserMessage(backendText, { displayText });
    })();
  };

  return (
    <div className="product-card-carousel w-full max-w-full">
      <div
        ref={listRef}
        className="product-card-track"
        onScroll={event => {
          const element = event.currentTarget;
          const firstCard = element.firstElementChild as HTMLElement | null;
          const styles = window.getComputedStyle(element);
          const gap = Number.parseFloat(styles.columnGap || styles.gap || "0");
          const cardWidth = firstCard ? firstCard.offsetWidth + gap : element.clientWidth;
          if (!cardWidth) {
            return;
          }
          activeIndex.value = Math.round(element.scrollLeft / cardWidth);
        }}
      >
        {visibleProducts.map((product, index) => (
          <ProductCardItem
            key={`product-${index}`}
            product={product}
            showImages={showImages}
            showCartActions={showCartActions}
            isExpanded={
              matchedExpandedProduct
                ? productsMatch(product, matchedExpandedProduct)
                : false
            }
            onAddToCart={() => {
              if (!showCartActions) {
                return;
              }
              cart.openAddToCart(product);
            }}
            onViewDetails={() => {
              handleViewDetails(product);
            }}
          />
        ))}
      </div>
      {visibleProducts.length > 1 && (
        <div className="flex items-center justify-center gap-2 pb-1">
          {visibleProducts.map((product, index) => (
            <button
              key={`${product.name}-${index}`}
              type="button"
              aria-label={`Go to product ${index + 1}`}
              className={clsx(
                "h-2.5 rounded-full transition-all duration-200",
                activeIndex.value === index
                  ? "w-5 bg-accent"
                  : "w-2.5 bg-base-border"
              )}
              onClick={() => {
                scrollToIndex(index);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCardItem({
  product,
  showImages,
  showCartActions,
  isExpanded = false,
  onAddToCart,
  onViewDetails,
}: {
  product: ProductCard;
  showImages: boolean;
  showCartActions: boolean;
  isExpanded?: boolean;
  onAddToCart: (element: HTMLElement) => void | Promise<void>;
  onViewDetails: () => void;
}) {
  const cart = useProductCart();
  const features = useBusinessModeFeatures();
  const imageLoaded = useSignal(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cartActive = showCartActions && cart.isCartActive(product.name);
  const displayPrice = formatProductPriceForDisplay(
    product.price,
    features.value.priceDisplayMode
  );

  useEffect(() => {
    imageLoaded.value = false;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      imageLoaded.value = true;
    }
  }, [product.imageUrl]);

  return (
    <article
      className={clsx(
        "product-card product-card-loaded",
        isExpanded && "product-card-expanded-active"
      )}
    >
      {showImages && (
        <button
          type="button"
          className="product-card-media product-card-media-button"
          aria-label={`View ${product.name}`}
          onClick={() => {
            onViewDetails();
          }}
        >
          {!imageLoaded.value && (
            <div className="product-card-media-skeleton" aria-hidden="true" />
          )}
          {product.imageUrl ? (
            <img
              ref={imageRef}
              src={product.imageUrl}
              alt={product.name}
              referrerPolicy="no-referrer"
              className={clsx(
                "product-card-image",
                imageLoaded.value && "product-card-image-loaded"
              )}
              onLoad={() => {
                imageLoaded.value = true;
              }}
            />
          ) : null}
        </button>
      )}
      <div className="product-card-content flex flex-col gap-1 p-3">
        <div className="product-card-title text-[11px] font-semibold leading-4 text-base-primary">
          {product.name}
        </div>
        {displayPrice ? (
          <div className="product-card-price text-xs font-semibold leading-4 text-base-primary">
            {displayPrice}
          </div>
        ) : null}
        <div
          className={clsx(
            "product-card-actions",
            !showCartActions && "product-card-actions-single"
          )}
        >
          {showCartActions ? (
            <button
              type="button"
              className="product-card-cart-btn"
              data-active={cartActive ? "true" : "false"}
              aria-label={`Add ${product.name} to cart`}
              onClick={event => {
                void onAddToCart(event.currentTarget);
              }}
            >
              <Icon name="cart" size="sm" />
            </button>
          ) : null}
          <button
            type="button"
            className={clsx(
              "product-card-view-btn",
              !showCartActions && "product-card-view-btn-full",
              isExpanded && "product-card-view-btn-active"
            )}
            onClick={() => {
              onViewDetails();
            }}
          >
            {isExpanded ? "Viewing" : "View"}
          </button>
        </div>
      </div>
    </article>
  );
}

function extractImageFromDetailMessage(message: string): string | undefined {
  return message
    .match(/(?:Image(?:\s+URL)?|URL):\s*(https?:\/\/\S+)/i)?.[1]
    ?.replace(/\s*\[blocked\]$/i, "")
    .trim();
}

function isStandaloneProductDetailMessage(message: string): boolean {
  const trimmed = message.trim();
  if (
    !trimmed ||
    messageHasStructuredProducts(trimmed) ||
    looksLikeMarkdownMessage(trimmed)
  ) {
    return false;
  }

  const detailText = extractAgentProductDetailText(trimmed);
  if (!detailText) {
    return false;
  }

  return (
    /^(?:Title|Name|Price|Description|Here are)/im.test(trimmed) ||
    detailText.length > 100
  );
}

function resolveDetailProductForAgentReply(
  entries: DisplayTranscriptEntry[],
  entryIndex: number,
  activeProduct: ProductCardData | null
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
      const requestedName = getRequestedProductNameFromDetailMessage(
        previous.message,
        previous.displayMessage
      );
      if (!requestedName) {
        return null;
      }

      if (
        activeProduct &&
        getProductDisplayName(activeProduct.name).toLowerCase() ===
          getProductDisplayName(requestedName).toLowerCase()
      ) {
        return activeProduct;
      }

      return withProductDisplayName({
        id: activeProduct?.id,
        name: requestedName,
        price: activeProduct?.price,
        imageUrl: activeProduct?.imageUrl,
        description: activeProduct?.description,
        productUrl: activeProduct?.productUrl,
        category: activeProduct?.category,
        sizes: activeProduct?.sizes,
      });
    }

    if (previous.role === "agent") {
      return null;
    }
  }

  return null;
}

function AgentMessageBubble({
  entry,
  entryIndex,
  entries,
}: {
  entry: Extract<DisplayTranscriptEntry, { type: "message" }>;
  entryIndex: number;
  entries: DisplayTranscriptEntry[];
}) {
  const { previewUrl } = useAvatarConfig();
  const linkConfig = useMarkdownLinkConfig();
  const config = useWidgetConfig();
  const features = useBusinessModeFeatures();
  const cart = useProductCart();
  const { activeProduct } = useSheetContent();
  const showProductCards = features.value.showProductCards;
  const showCartActions = features.value.showCartActions;
  const checkoutEnabled = features.value.checkoutEnabled;
  const showImages = config.value.product_cards?.show_images ?? true;
  const agentLabel =
    config.value.product_cards?.agent_label?.trim() || "Your AI Stylist";
  const frozenDisplayRef = useRef<AgentProductDisplay | null>(null);
  const entryKeyRef = useRef("");

  const displayMessage =
    config.value.strip_audio_tags && !entry.isText
      ? stripAudioTags(entry.message)
      : entry.message;

  const entryKey = `${entry.conversationIndex}-${entry.eventId ?? "none"}`;
  if (entryKeyRef.current !== entryKey) {
    entryKeyRef.current = entryKey;
    frozenDisplayRef.current = null;
  }

  const resolved = resolveAgentProductDisplay(
    entry,
    displayMessage,
    showProductCards
  );
  if (resolved.showProducts && !frozenDisplayRef.current?.showProducts) {
    frozenDisplayRef.current = resolved;
  }
  const display = frozenDisplayRef.current?.showProducts
    ? frozenDisplayRef.current
    : resolved;

  const isDetailAgentReply = isProductDetailAgentResponse(entry, entries, entryIndex);
  const isCartAddConfirmationReply = isAgentReplyAfterAddToCart(
    entry,
    entryIndex,
    entries
  );
  const detailProduct =
    isDetailAgentReply && showProductCards
      ? resolveDetailProductForAgentReply(
          entries,
          entryIndex,
          activeProduct.value
        )
      : null;
  const isDetailStructured = isProductDetailStructuredMessage(displayMessage);
  const suppressProductCarousel =
    isDetailAgentReply ||
    (isDetailStructured && !display.showProducts);

  const effectiveDisplay = suppressProductCarousel
    ? {
        ...display,
        showProducts: false,
        showProductSkeletons: false,
        products: [],
        message: isDetailAgentReply ? "" : display.message,
        outroMessage: isDetailAgentReply ? "" : display.outroMessage,
      }
    : display;

  const standaloneProductDetail =
    showProductCards &&
    !detailProduct &&
    !isCartAddConfirmationReply &&
    !effectiveDisplay.showProducts &&
    !effectiveDisplay.showProductSkeletons &&
    isStandaloneProductDetailMessage(displayMessage) &&
    !isDetailAgentReply;
  const parsedInlineDetail = standaloneProductDetail
    ? parseAgentProductDetailContent(displayMessage, { name: "Product" })
    : null;
  const inlineDetailProduct = parsedInlineDetail
    ? withProductDisplayName({
        name: parsedInlineDetail.name,
        price: parsedInlineDetail.price,
        description: parsedInlineDetail.description,
        imageUrl: parsedInlineDetail.imageUrl || extractImageFromDetailMessage(displayMessage),
      })
    : null;

  const checkoutMessage = effectiveDisplay.message
    ? formatCheckoutAgentMessage(effectiveDisplay.message)
    : { introText: "", checkoutUrl: null as string | null };
  const detailReplyText =
    isDetailAgentReply && !detailProduct
      ? getProductDetailAgentReplyText(displayMessage)
      : "";
  const messageText = checkoutMessage.checkoutUrl
    ? checkoutMessage.introText
    : isDetailAgentReply
      ? detailReplyText
      : isCartAddConfirmationReply
        ? ""
        : effectiveDisplay.message;

  const showDetailInline = Boolean(detailProduct);
  const showAgentBubble =
    Boolean(messageText) &&
    !standaloneProductDetail &&
    !showDetailInline &&
    !isCartAddConfirmationReply;

  return (
    <div className="w-full min-w-0 max-w-full origin-top-left transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75">
      <div className="flex gap-2.5 pr-4 min-w-0 max-w-full">
        <img
          src={previewUrl}
          alt="AI agent avatar"
          className="bg-base-border shrink-0 w-5 h-5 rounded-full"
        />
        <div className="flex min-w-0 max-w-full flex-1 flex-col items-start gap-1.5">
          {effectiveDisplay.showBreadcrumb && !isDetailAgentReply && (
            <p className="product-breadcrumb mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-base-subtle">
              {agentLabel}
            </p>
          )}
          {showDetailInline && detailProduct ? (
            <ProductExpandedCard product={detailProduct} />
          ) : showAgentBubble ? (
            <WidgetStreamdown
              className={clsx(
                "agent-message-bubble max-w-full px-3 py-2.5 rounded-bubble text-sm min-w-0 wrap-break-word break-all whitespace-pre-wrap bg-base-active text-base-primary",
                effectiveDisplay.showBreadcrumb && "bg-transparent px-0 py-0"
              )}
              linkConfig={linkConfig.value}
            >
              {messageText}
            </WidgetStreamdown>
          ) : null}
          {checkoutMessage.checkoutUrl &&
            checkoutEnabled &&
            !isCheckoutFlowStep(cart.checkoutStep.value) && (
            <button
              type="button"
              className="product-cart-checkout-link w-full"
              onClick={() => {
                cart.openCheckoutInNewTab(checkoutMessage.checkoutUrl ?? undefined);
              }}
            >
              Proceed to checkout
            </button>
          )}
          {effectiveDisplay.showToolStatus && entry.toolStatus && (
            <div className={clsx("self-start", effectiveDisplay.message && "mt-2")}>
              <ToolCallMessage status={entry.toolStatus} />
            </div>
          )}
        </div>
      </div>
      {(effectiveDisplay.showProductSkeletons || effectiveDisplay.showProducts) && (
        <div className="product-card-carousel-bleed mt-2">
          {effectiveDisplay.showProductSkeletons ? (
            <ProductCardSkeletons
              count={effectiveDisplay.skeletonCount}
              showImages={showImages}
            />
          ) : (
            <ProductCards
              products={effectiveDisplay.products}
              showImages={showImages}
              showCartActions={showCartActions}
            />
          )}
        </div>
      )}
      {inlineDetailProduct && !isCartAddConfirmationReply ? (
        <div className="product-card-carousel-bleed mt-2">
          <ProductExpandedCard product={inlineDetailProduct} />
        </div>
      ) : null}
      {effectiveDisplay.outroMessage &&
        !isDetailAgentReply &&
        !isCartAddConfirmationReply && (
        <div className="mt-2 flex gap-2.5 pr-4 min-w-0">
          <div className="w-5 shrink-0" aria-hidden="true" />
          <WidgetStreamdown
            className="max-w-[520px] text-sm min-w-0 wrap-break-word whitespace-pre-wrap bg-transparent px-0 py-0 text-base-primary"
            linkConfig={linkConfig.value}
          >
            {effectiveDisplay.outroMessage}
          </WidgetStreamdown>
        </div>
      )}
    </div>
  );
}

function UserMessageBubble({
  entry,
}: {
  entry: Extract<DisplayTranscriptEntry, { type: "message" }>;
  entryIndex: number;
}) {
  const { previewUrl } = useAvatarConfig();
  const fileInput = entry.fileInput;

  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-2">
      <div
        className={clsx(
          "flex gap-2.5 transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75",
          entry.role === "user"
            ? "justify-end self-end pl-16 origin-top-right"
            : "pr-16 origin-top-left"
        )}
      >
        {entry.role === "agent" && (
          <img
            src={previewUrl}
            alt="AI agent avatar"
            className="bg-base-border shrink-0 w-5 h-5 rounded-full"
          />
        )}
        <div className="flex flex-col items-end gap-1.5 min-w-0">
          {fileInput && (
            <FileAttachment
              fileName={fileInput.fileName}
              mimeType={fileInput.mimeType}
              previewUrl={fileInput.previewUrl}
            />
          )}
          {entry.message && (
            <div
              dir="auto"
              className={clsx(
                "px-3 py-2.5 rounded-bubble text-sm min-w-0 wrap-break-word whitespace-pre-wrap",
                entry.role === "user"
                  ? "bg-accent text-accent-primary"
                  : "bg-base-active text-base-primary"
              )}
            >
              {getUserMessageDisplayText(entry.message, entry.displayMessage)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileAttachment({
  fileName,
  mimeType,
  previewUrl,
}: {
  fileName: string;
  mimeType: string;
  previewUrl: string | null;
}) {
  const isImage = isImageMimeType(mimeType);

  if (isImage && previewUrl) {
    return (
      <div className="rounded-bubble border border-base-border shadow-sm p-1">
        <img
          src={previewUrl}
          alt={fileName}
          className="max-w-[180px] rounded-input object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-bubble bg-accent text-accent-primary">
      <FileDocIcon />
      <span className="truncate text-sm">{fileName}</span>
    </div>
  );
}

function FileDocIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      className="shrink-0 opacity-70"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function DisconnectionMessage({
  entry,
}: {
  entry: Extract<DisplayTranscriptEntry, { type: "disconnection" }>;
}) {
  const text = useTextContents();
  const { lastId } = useConversation();
  const endFeedbackType = useEndFeedbackType();
  const config = useWidgetConfig();

  return (
    <div className="px-8 flex justify-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[calc(var(--el-bubble-radius)+6px)] border border-base-border bg-base px-4 py-4 shadow-sm">
        {endFeedbackType.value === "rating" && <Feedback />}
        <div className="text-center transition-opacity duration-200 data-hidden:opacity-0">
          <div className="text-xs font-medium text-base-primary">
            {entry.role === "user"
              ? text.user_ended_conversation
              : text.agent_ended_conversation}
          </div>
          {lastId.value && config.value.show_conversation_id && (
            <div className="mt-1 break-all text-xs text-base-subtle">
              {text.conversation_id}: {lastId.value}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorMessage({
  entry,
}: {
  entry: Extract<DisplayTranscriptEntry, { type: "error" }>;
}) {
  const text = useTextContents();
  const { lastId } = useConversation();

  return (
    <div className="px-8 text-xs text-base-error text-center transition-opacity duration-200 data-hidden:opacity-0">
      {text.error_occurred}
      <br />
      {entry.message}
      {lastId.value && (
        <>
          <br />
          <span className="text-base-subtle break-all">
            {text.conversation_id}: {lastId.value}
          </span>
        </>
      )}
    </div>
  );
}

interface ModeToggleMessageProps {
  entry: Extract<DisplayTranscriptEntry, { type: "mode_toggle" }>;
}

function ModeToggleMessage({ entry }: ModeToggleMessageProps) {
  const text = useTextContents();

  return (
    <div className="px-8 text-xs text-base-subtle text-center transition-opacity duration-200 data-hidden:opacity-0">
      {entry.mode === "text"
        ? text.switched_to_text_mode
        : text.switched_to_voice_mode}
    </div>
  );
}

function ToolCallMessage({ status }: { status: ToolCallStatusType }) {
  const text = useTextContents();

  return (
    <div className="-my-4 first:mt-0 last:mb-0 flex items-center">
      <div className="flex items-center h-7 px-2 gap-1 rounded-button border border-base-border bg-base">
        {status === ToolCallStatus.LOADING && (
          <>
            <Icon name="loader" size="md" className="animate-spin shrink-0" />
            <span className="text-xs leading-4">{text.agent_working}</span>
          </>
        )}
        {status === ToolCallStatus.SUCCESS && (
          <InOutTransition active={true} initial={false}>
            <span className="flex items-center gap-1 transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75">
              <Icon name="check" size="sm" className="shrink-0" />
              <span className="text-xs leading-4">{text.agent_done}</span>
            </span>
          </InOutTransition>
        )}
        {status === ToolCallStatus.ERROR && (
          <InOutTransition active={true} initial={false}>
            <span className="flex items-center gap-1 transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75">
              <Icon name="x" size="sm" className="shrink-0 text-base-error" />
              <span className="text-xs text-base-error leading-4">
                {text.agent_error}
              </span>
            </span>
          </InOutTransition>
        )}
      </div>
    </div>
  );
}

function getMessageComponent(
  entry: DisplayTranscriptEntry,
  entryIndex: number,
  entries: DisplayTranscriptEntry[]
) {
  if (entry.type === "disconnection") {
    return <DisconnectionMessage entry={entry} />;
  }
  if (entry.type === "mode_toggle") {
    return <ModeToggleMessage entry={entry} />;
  }
  if (entry.type === "error") {
    return <ErrorMessage entry={entry} />;
  }
  if (entry.role === "agent") {
    return (
      <AgentMessageBubble entry={entry} entryIndex={entryIndex} entries={entries} />
    );
  }
  return <UserMessageBubble entry={entry} entryIndex={entryIndex} />;
}

export function TranscriptMessage({
  entry,
  entryIndex,
  entries,
  animateIn,
}: TranscriptMessageProps) {
  return (
    <InOutTransition initial={!animateIn} active={true}>
      {getMessageComponent(entry, entryIndex, entries)}
    </InOutTransition>
  );
}
