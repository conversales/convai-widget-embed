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
} from "../contexts/widget-config";
import { stripAudioTags } from "../utils/stripAudioTags";
import { WidgetStreamdown } from "../markdown";
import { isImageMimeType } from "./useFileUpload";
import { useProductCart } from "../contexts/product-cart";
import { useWidgetStorageScope } from "../hooks/useWidgetStorageScope";
import { getStoredCartId } from "../services/cart-sync";
import type { ProductCardData } from "../types/product-card";
import {
  buildAddToCartMessages,
  buildProductViewMessages,
  extractProductIdFromRecord,
  extractProductIdFromText,
  getProductDisplayName,
  getUserMessageDisplayText,
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
  cleanAgentUrl,
  formatCheckoutAgentMessage,
} from "../utils/agent-response";
import { isCheckoutFlowStep } from "../utils/checkout";

interface TranscriptMessageProps {
  entry: DisplayTranscriptEntry;
  animateIn: boolean;
}

type ProductCard = ProductCardData;

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
    .filter(({ line }) => !isProductActionBullet(line));
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
}: {
  products: ProductCard[];
  showImages: boolean;
}) {
  const { isDisconnected, sendUserMessage, startSession } = useConversation();
  const sessionScope = useWidgetStorageScope();
  const cart = useProductCart();
  const visibleProducts = products;
  const activeIndex = useSignal(0);
  const listRef = useRef<HTMLDivElement | null>(null);

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
            onAddToCart={async element => {
              const cartId = getStoredCartId(sessionScope.peek());
              const { displayText, backendText } = buildAddToCartMessages(
                product,
                { cartId }
              );
              if (isDisconnected.value) {
                await startSession(element, backendText, { displayText });
                return;
              }
              cart.openAddToCart(product);
            }}
            onViewDetails={async element => {
              if (product.productUrl) {
                window.open(product.productUrl, "_blank", "noopener,noreferrer");
                return;
              }
              const { displayText, backendText } =
                buildProductViewMessages(product);
              if (isDisconnected.value) {
                await startSession(element, backendText, { displayText });
                return;
              }
              sendUserMessage(backendText, { displayText });
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
  onAddToCart,
  onViewDetails,
}: {
  product: ProductCard;
  showImages: boolean;
  onAddToCart: (element: HTMLElement) => void | Promise<void>;
  onViewDetails: (element: HTMLElement) => void | Promise<void>;
}) {
  const cart = useProductCart();
  const imageLoaded = useSignal(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cartActive = cart.isCartActive(product.name);

  useEffect(() => {
    imageLoaded.value = false;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      imageLoaded.value = true;
    }
  }, [product.imageUrl]);

  return (
    <article className="product-card product-card-loaded">
      {showImages && (
        <div className="product-card-media">
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
        </div>
      )}
      <div className="product-card-content flex flex-col gap-1 p-3">
        <div className="product-card-title text-[11px] font-semibold leading-4 text-base-primary">
          {product.name}
        </div>
        <div className="product-card-price text-xs font-semibold leading-4 text-base-primary">
          {product.price || "\u00a0"}
        </div>
        <div className="product-card-actions">
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
          <button
            type="button"
            className="product-card-view-btn"
            onClick={event => {
              void onViewDetails(event.currentTarget);
            }}
          >
            View
          </button>
        </div>
      </div>
    </article>
  );
}

function AgentMessageBubble({
  entry,
}: {
  entry: Extract<DisplayTranscriptEntry, { type: "message" }>;
}) {
  const { previewUrl } = useAvatarConfig();
  const linkConfig = useMarkdownLinkConfig();
  const config = useWidgetConfig();
  const cart = useProductCart();
  const showProductCards = config.value.product_cards?.enabled !== false;
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

  const checkoutMessage = display.message
    ? formatCheckoutAgentMessage(display.message)
    : { introText: "", checkoutUrl: null as string | null };
  const messageText = checkoutMessage.checkoutUrl
    ? checkoutMessage.introText
    : display.message;

  return (
    <div className="w-full min-w-0 max-w-full origin-top-left transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75">
      <div className="flex gap-2.5 pr-4 min-w-0 max-w-full">
        <img
          src={previewUrl}
          alt="AI agent avatar"
          className="bg-base-border shrink-0 w-5 h-5 rounded-full"
        />
        <div className="flex min-w-0 max-w-full flex-1 flex-col items-start gap-1.5">
          {display.showBreadcrumb && (
            <p className="product-breadcrumb mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-base-subtle">
              {agentLabel}
            </p>
          )}
          {messageText && (
            <WidgetStreamdown
              className={clsx(
                "agent-message-bubble max-w-full px-3 py-2.5 rounded-bubble text-sm min-w-0 wrap-break-word break-all whitespace-pre-wrap bg-base-active text-base-primary",
                display.showBreadcrumb && "bg-transparent px-0 py-0"
              )}
              linkConfig={linkConfig.value}
            >
              {messageText}
            </WidgetStreamdown>
          )}
          {checkoutMessage.checkoutUrl &&
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
          {display.showToolStatus && entry.toolStatus && (
            <div className={clsx("self-start", display.message && "mt-2")}>
              <ToolCallMessage status={entry.toolStatus} />
            </div>
          )}
        </div>
      </div>
      {(display.showProductSkeletons || display.showProducts) && (
        <div className="product-card-carousel-bleed mt-2">
          {display.showProductSkeletons ? (
            <ProductCardSkeletons
              count={display.skeletonCount}
              showImages={showImages}
            />
          ) : (
            <ProductCards products={display.products} showImages={showImages} />
          )}
        </div>
      )}
      {display.outroMessage && (
        <div className="mt-2 flex gap-2.5 pr-4 min-w-0">
          <div className="w-5 shrink-0" aria-hidden="true" />
          <WidgetStreamdown
            className="max-w-[520px] text-sm min-w-0 wrap-break-word whitespace-pre-wrap bg-transparent px-0 py-0 text-base-primary"
            linkConfig={linkConfig.value}
          >
            {display.outroMessage}
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
}) {
  const { previewUrl } = useAvatarConfig();
  const fileInput = entry.fileInput;

  return (
    <div
      className={clsx(
        "flex gap-2.5 transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:scale-75",
        entry.role === "user"
          ? "justify-end pl-16 origin-top-right"
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

function getMessageComponent(entry: DisplayTranscriptEntry) {
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
    return <AgentMessageBubble entry={entry} />;
  }
  return <UserMessageBubble entry={entry} />;
}

export function TranscriptMessage({
  entry,
  animateIn,
}: TranscriptMessageProps) {
  return (
    <InOutTransition initial={!animateIn} active={true}>
      {getMessageComponent(entry)}
    </InOutTransition>
  );
}
