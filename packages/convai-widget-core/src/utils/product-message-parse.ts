import type { ProductCardData } from "../types/product-card";
import {
  extractProductIdFromText,
  getProductDisplayName,
  withProductDisplayName,
} from "./product-display";
import { cleanAgentUrl } from "./agent-response";

const METADATA_LINE_PREFIX =
  /^(Price|Original\s+Price|Description|Product\s+URL|Product\s+ID|Category|Availability|(?:Available\s+)?Sizes?|Image(?:\s+URL)?|URL|Actions):/i;
const PRODUCT_ACTION_LABELS = /^(view details|add to cart)$/i;
const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|#|$)/i;
const PRODUCT_BLOCK_START =
  /(?:^|\n)(?:(?:Title|Name):\s*[^\n]+|[^\n]+)\nPrice:\s*/i;
const TITLE_PRODUCT_BLOCK_START = /(?:^|\n)Title:\s*.+\nPrice:\s*/i;

export function normalizeProductMessage(message: string): string {
  return message
    .replace(/\r\n/g, "\n")
    .replace(
      /\*\*(Title|Name|Price|Availability|Image(?:\s+URL)?|Product\s+URL):\*\*/gi,
      "$1:"
    )
    .replace(/^[\t ]*[-*•]\s+(Title|Name|Price|Availability|Image)/gim, "$1");
}

function extractProductNameFromLine(line: string): string {
  return line.replace(/^(?:Title|Name|Product):\s*/i, "").trim();
}

export function stripProductActionsSection(block: string): string {
  return block.replace(/\nActions:\s*\n(?:[-*•]\s*[^\n]+\n?)*/gi, "\n").trim();
}

function extractLabeledUrl(
  body: string,
  labelPattern: RegExp
): string | undefined {
  const match = body.match(labelPattern)?.[1];
  return match ? cleanAgentUrl(match) : undefined;
}

export function isImageAssetUrl(url: string): boolean {
  return IMAGE_URL_PATTERN.test(url);
}

export function classifyProductUrl(url: string | undefined): {
  imageUrl?: string;
  productUrl?: string;
} {
  if (!url) {
    return {};
  }

  const clean = url.trim();
  if (isImageAssetUrl(clean)) {
    return { imageUrl: clean };
  }

  return { productUrl: clean };
}

export function extractSizesFromBody(body: string): string[] | undefined {
  const match = body.match(/^(?:Available\s+)?Sizes?:\s*(.+)$/im)?.[1]?.trim();
  if (!match) {
    return undefined;
  }

  if (match.startsWith("[")) {
    try {
      const parsed = JSON.parse(match) as unknown;
      if (Array.isArray(parsed)) {
        const sizes = parsed.map(value => String(value).trim()).filter(Boolean);
        return sizes.length > 0 ? sizes : undefined;
      }
    } catch {
      // fall through to delimiter split
    }
  }

  const sizes = match
    .split(/[,|/]/)
    .map(value => value.trim())
    .filter(Boolean);

  return sizes.length > 0 ? sizes : undefined;
}

export function extractSizesFromRecord(
  record: Record<string, unknown>
): string[] | undefined {
  const raw =
    record.sizes ??
    record.available_sizes ??
    record.availableSizes ??
    record.size_options ??
    record.sizeOptions;

  if (Array.isArray(raw)) {
    const sizes = raw
      .map(value => {
        if (typeof value === "string") {
          return value.trim();
        }
        if (value && typeof value === "object") {
          const entry = value as Record<string, unknown>;
          return firstNonEmptyStringFromRecord(
            entry.size,
            entry.label,
            entry.name,
            entry.title
          );
        }
        return String(value).trim();
      })
      .filter((value): value is string => Boolean(value));
    return sizes.length > 0 ? sizes : undefined;
  }

  if (typeof raw === "string" && raw.trim()) {
    return extractSizesFromBody(`Sizes: ${raw}`);
  }

  return undefined;
}

function firstNonEmptyStringFromRecord(
  ...values: unknown[]
): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractIdFromProductUrl(url: string): string | undefined {
  const segments = url.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1]?.split(/[?#]/)[0];
  if (lastSegment && /^[a-z0-9_-]+$/i.test(lastSegment)) {
    return lastSegment;
  }

  return url.match(/[?&](?:id|product_id|productId)=([^&]+)/i)?.[1];
}

export function isStructuredProductBlock(block: string): boolean {
  const content = stripProductActionsSection(normalizeProductMessage(block));
  const lines = content
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return false;
  }

  if (PRODUCT_ACTION_LABELS.test(lines[0])) {
    return false;
  }

  if (/^Title:\s*/i.test(lines[0])) {
    return lines.some(line => METADATA_LINE_PREFIX.test(line));
  }

  return lines.slice(1).some(line => METADATA_LINE_PREFIX.test(line));
}

export function parseStructuredProductBlock(
  block: string
): ProductCardData | null {
  const content = stripProductActionsSection(normalizeProductMessage(block));
  const lines = content
    .split(/\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  const titleLine = lines.find(line => /^Title:\s*/i.test(line));
  const name = titleLine
    ? extractProductNameFromLine(titleLine)
    : extractProductNameFromLine(lines[0]);

  if (
    !name ||
    PRODUCT_ACTION_LABELS.test(name) ||
    METADATA_LINE_PREFIX.test(name)
  ) {
    return null;
  }

  const body = titleLine ? lines.join("\n") : lines.slice(1).join("\n");
  const price =
    body.match(/^Price:\s*(.+)$/im)?.[1]?.trim() ??
    body.match(/Price:\s*(.+?)(?:\n|$)/im)?.[1]?.trim();
  const description = body.match(/^Description:\s*(.+)$/im)?.[1]?.trim();
  const category = body.match(/^Category:\s*(.+)$/im)?.[1]?.trim();
  const imageUrl =
    extractLabeledUrl(
      body,
      /^(?:Image(?:\s+URL)?|Photo|Picture|Thumbnail):\s*(https?:\/\/\S+)/im
    ) ??
    classifyProductUrl(
      extractLabeledUrl(body, /^Product\s+URL:\s*(https?:\/\/\S+)/im)
    ).imageUrl;
  const productUrlValue = extractLabeledUrl(
    body,
    /^Product\s+URL:\s*(https?:\/\/\S+)/im
  );
  const genericUrl = extractLabeledUrl(body, /^URL:\s*(https?:\/\/\S+)/im);
  const classifiedProductUrl = classifyProductUrl(
    productUrlValue ?? genericUrl
  );
  const id =
    body.match(/^Product\s+ID:\s*(\S+)/im)?.[1]?.replace(/[.,;]+$/, "") ??
    (classifiedProductUrl.productUrl
      ? extractIdFromProductUrl(classifiedProductUrl.productUrl)
      : undefined) ??
    extractProductIdFromText(body);
  const productUrl = classifiedProductUrl.productUrl;
  const sizes = extractSizesFromBody(body);

  return withProductDisplayName({
    id,
    name: getProductDisplayName(name),
    price,
    description,
    category,
    imageUrl: imageUrl ?? classifiedProductUrl.imageUrl,
    productUrl,
    sizes,
  });
}

function splitMessageIntoProductSections(message: string): {
  intro: string;
  productBlocks: string[];
  outro: string;
} {
  const starts = [
    ...message.matchAll(new RegExp(PRODUCT_BLOCK_START.source, "gim")),
  ];
  if (starts.length === 0) {
    return { intro: message.trim(), productBlocks: [], outro: "" };
  }

  const firstStart = starts[0].index ?? 0;
  const intro = message.slice(0, firstStart).trim();
  const productBlocks: string[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0;
    const end =
      index + 1 < starts.length
        ? (starts[index + 1].index ?? message.length)
        : message.length;
    const block = message.slice(start, end).trim();
    if (block) {
      productBlocks.push(block);
    }
  }

  const lastBlock = productBlocks[productBlocks.length - 1] ?? "";
  const trailingMatch = lastBlock.match(
    /\n\n+(Would you like[\s\S]*|Let me know[\s\S]*|Tell me[\s\S]*|If you[\s\S]*|Is there[\s\S]*|Do you[\s\S]*)$/i
  );
  let outro = "";
  if (trailingMatch?.[1]) {
    outro = trailingMatch[1].trim();
    productBlocks[productBlocks.length - 1] = lastBlock
      .slice(0, trailingMatch.index)
      .trim();
  } else {
    const inlineOutro = lastBlock.match(
      /\n(?:Is there|Would you like|Let me know|Tell me|If you|Do you)[\s\S]*$/i
    );
    if (inlineOutro?.index != null) {
      outro = lastBlock.slice(inlineOutro.index).trim();
      productBlocks[productBlocks.length - 1] = lastBlock
        .slice(0, inlineOutro.index)
        .trim();
    }
  }

  return { intro, productBlocks, outro };
}

function parseTitleLabeledProductBlocks(
  message: string
): StructuredProductParseResult {
  const parts = message
    .split(/(?=(?:^|\n)Title:\s)/im)
    .map(part => part.trim())
    .filter(Boolean);

  const intro: string[] = [];
  const outro: string[] = [];
  const products: ProductCardData[] = [];

  for (const part of parts) {
    if (/^Title:\s/im.test(part)) {
      const product = parseStructuredProductBlock(part);
      if (product) {
        products.push(product);
      } else {
        outro.push(part);
      }
      continue;
    }

    if (products.length === 0) {
      intro.push(part);
    } else {
      outro.push(part);
    }
  }

  if (products.length === 0) {
    return {
      products: [],
      introMessage: "",
      outroMessage: "",
      cleanedMessage: message,
    };
  }

  const introMessage = intro.join("\n\n").trim();
  const outroMessage = outro.join("\n\n").trim();
  return {
    products,
    introMessage,
    outroMessage,
    cleanedMessage: [introMessage, outroMessage].filter(Boolean).join("\n\n"),
  };
}

export type StructuredProductParseResult = {
  products: ProductCardData[];
  introMessage: string;
  outroMessage: string;
  cleanedMessage: string;
};

export function parseStructuredProductBlocks(
  message: string
): StructuredProductParseResult {
  const normalized = normalizeProductMessage(message);
  const sectioned = splitMessageIntoProductSections(normalized);
  const products = sectioned.productBlocks
    .map(parseStructuredProductBlock)
    .filter((product): product is ProductCardData => product !== null);

  if (products.length === 0) {
    const blocks = normalized
      .split(/\n\n+/)
      .map(block => block.trim())
      .filter(Boolean);
    const intro: string[] = [];
    const outro: string[] = [];
    const fallbackProducts: ProductCardData[] = [];
    let sawProduct = false;

    for (const block of blocks) {
      if (isStructuredProductBlock(block)) {
        sawProduct = true;
        const product = parseStructuredProductBlock(block);
        if (product) {
          fallbackProducts.push(product);
        }
        continue;
      }

      if (!sawProduct) {
        intro.push(block);
      } else {
        outro.push(block);
      }
    }

    if (fallbackProducts.length === 0) {
      return parseTitleLabeledProductBlocks(normalized);
    }

    const introMessage = intro.join("\n\n").trim();
    const outroMessage = outro.join("\n\n").trim();
    return {
      products: fallbackProducts,
      introMessage,
      outroMessage,
      cleanedMessage: [introMessage, outroMessage].filter(Boolean).join("\n\n"),
    };
  }

  const introMessage = sectioned.intro.trim();
  const outroMessage = sectioned.outro.trim();

  return {
    products,
    introMessage,
    outroMessage,
    cleanedMessage: [introMessage, outroMessage].filter(Boolean).join("\n\n"),
  };
}

export function messageHasStructuredProducts(message: string): boolean {
  const normalized = normalizeProductMessage(message);
  return (
    PRODUCT_BLOCK_START.test(normalized) ||
    TITLE_PRODUCT_BLOCK_START.test(normalized)
  );
}

export function extractIntroBeforeStructuredProducts(message: string): string {
  const match = message.match(PRODUCT_BLOCK_START);
  if (match?.index != null && match.index > 0) {
    return message.slice(0, match.index).trim();
  }
  if (match?.index === 0) {
    return "";
  }
  return message;
}

export function isProductActionBullet(line: string): boolean {
  const content = line.replace(/^[-*•]\s+/, "").trim();
  return PRODUCT_ACTION_LABELS.test(content);
}
