import { clsx } from "clsx";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { useAttribute } from "../contexts/attributes";
import { useConversation } from "../contexts/conversation";
import { useProductCart } from "../contexts/product-cart";
import { useSheetContent } from "../contexts/sheet-content";
import { useAccountId, useBusinessModeFeatures } from "../contexts/widget-config";
import type { ProductCardData } from "../types/product-card";
import { buildProductDetailsRequestMessages, isProductDetailsRequestMessage } from "../utils/product-display";
import {
  extractAgentProductDetailText,
  isValidProductDetailName,
  parseAgentProductDetailContent,
  resolveProductDetails,
} from "../utils/product-details";

interface ProductDetailViewProps {
  product: ProductCardData;
  onClose: () => void;
}

function ProductRecommendationCard({
  product,
  onSelect,
}: {
  product: ProductCardData;
  onSelect: (product: ProductCardData) => void;
}) {
  return (
    <button
      type="button"
      className="product-detail-recommendation-card"
      onClick={() => {
        onSelect(product);
      }}
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          referrerPolicy="no-referrer"
          className="product-detail-recommendation-image"
        />
      ) : (
        <div className="product-detail-recommendation-image-empty" />
      )}
      <span className="product-detail-recommendation-name">{product.name}</span>
      {product.price ? (
        <span className="product-detail-recommendation-price">{product.price}</span>
      ) : null}
    </button>
  );
}

export function ProductDetailView({ product, onClose }: ProductDetailViewProps) {
  const agentId = useAttribute("agent-id");
  const accountId = useAccountId();
  const features = useBusinessModeFeatures();
  const cart = useProductCart();
  const { openProductDetail } = useSheetContent();
  const { transcript, isDisconnected, sendUserMessage, startSession } =
    useConversation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestTranscriptIndex = useRef(0);
  const imageLoaded = useSignal(false);
  const loading = useSignal(true);
  const awaitingAgentDetails = useSignal(true);
  const agentDetailMessage = useSignal("");
  const resolvedProduct = useSignal<ProductCardData>(product);
  const recommendations = useSignal<ProductCardData[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const showCartActions = features.value.showCartActions;

  const displayFields = useComputed(() => {
    const resolved = resolvedProduct.value;
    const baseName = isValidProductDetailName(product.name, "Product");

    if (!agentDetailMessage.value) {
      return {
        name: isValidProductDetailName(resolved.name, baseName),
        price: resolved.price,
        description: resolved.description,
        colors: [] as string[],
        category: resolved.category,
        sizes: resolved.sizes,
        imageUrl: resolved.imageUrl,
      };
    }

    const parsed = parseAgentProductDetailContent(agentDetailMessage.value, {
      ...resolved,
      name: baseName,
    });

    return {
      name: parsed.name,
      price: parsed.price || resolved.price,
      description: parsed.description || resolved.description,
      colors: parsed.colors,
      category: resolved.category,
      sizes: resolved.sizes,
      imageUrl: resolved.imageUrl,
    };
  });

  useEffect(() => {
    const abort = new AbortController();
    loading.value = true;
    resolvedProduct.value = product;
    recommendations.value = [];
    agentDetailMessage.value = "";
    awaitingAgentDetails.value = true;

    const currentAgentId = agentId.value?.trim();
    if (!currentAgentId) {
      loading.value = false;
      awaitingAgentDetails.value = false;
      return () => {
        abort.abort();
      };
    }

    void resolveProductDetails(
      product,
      {
        agentId: currentAgentId,
        accountId: accountId.value.trim() || undefined,
        productId: product.id,
        imageUrl: product.imageUrl,
        productName: product.name,
        productUrl: product.productUrl,
      },
      abort.signal
    ).then(result => {
      if (abort.signal.aborted) {
        return;
      }

      resolvedProduct.value = result.product;
      recommendations.value = result.recommendations;
      loading.value = false;
    });

    const { displayText, backendText } = buildProductDetailsRequestMessages(product);
    requestTranscriptIndex.current = transcript.peek().length;

    void (async () => {
      const element = rootRef.current ?? document.body;
      if (isDisconnected.peek()) {
        await startSession(element, backendText, { displayText });
        return;
      }
      sendUserMessage(backendText, { displayText });
    })();

    return () => {
      abort.abort();
    };
  }, [
    product.id,
    product.name,
    product.imageUrl,
    product.productUrl,
    product.price,
    agentId.value,
    accountId.value,
  ]);

  useSignalEffect(() => {
    transcript.value;
    const entries = transcript.peek();
    let awaitingAgent = false;

    for (let index = requestTranscriptIndex.current; index < entries.length; index += 1) {
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
      if (entry.isStreaming) {
        agentDetailMessage.value = entry.message;
        if (detailText) {
          awaitingAgentDetails.value = true;
        }
        return;
      }

      agentDetailMessage.value = entry.message;
      awaitingAgentDetails.value = false;
      return;
    }
  });

  useEffect(() => {
    imageLoaded.value = false;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      imageLoaded.value = true;
    }
  }, [displayFields.value.imageUrl]);

  const handleAddToCart = () => {
    onClose();
    cart.openAddToCart({
      ...resolvedProduct.value,
      name: displayFields.value.name,
      price: displayFields.value.price,
      description: displayFields.value.description,
    });
  };

  const fields = displayFields.value;
  const showDescriptionLoading =
    awaitingAgentDetails.value && !fields.description && !loading.value;

  return (
    <div
      ref={rootRef}
      className="product-detail-page flex min-h-0 grow flex-col overflow-y-auto px-4 pb-4 pt-3"
    >
      <div className="product-detail-card">
        <div className="product-detail-hero">
          {loading.value || !imageLoaded.value ? (
            <div className="product-detail-hero-skeleton" aria-hidden="true" />
          ) : null}
          {fields.imageUrl ? (
            <img
              ref={imageRef}
              src={fields.imageUrl}
              alt={fields.name}
              referrerPolicy="no-referrer"
              className={clsx(
                "product-detail-image",
                imageLoaded.value && "product-detail-image-loaded"
              )}
              onLoad={() => {
                imageLoaded.value = true;
              }}
            />
          ) : (
            <div className="product-detail-hero-empty" aria-hidden="true" />
          )}
        </div>

        <div className="product-detail-body">
          {loading.value ? (
            <>
              <div className="product-detail-skeleton-line w-[42%]" />
              <div className="product-detail-skeleton-line h-5 w-[78%]" />
              <div className="product-detail-skeleton-line w-[28%]" />
              <div className="product-detail-skeleton-line h-16 w-full" />
            </>
          ) : (
            <>
              {fields.category ? (
                <p className="product-detail-category">{fields.category}</p>
              ) : null}
              <h2 className="product-detail-title">{fields.name}</h2>
              {fields.price ? (
                <p className="product-detail-price">{fields.price}</p>
              ) : null}
              {fields.colors.length > 0 ? (
                <div className="product-detail-colors">
                  <p className="product-detail-colors-label">Available colors</p>
                  <div className="product-detail-color-list">
                    {fields.colors.map(color => (
                      <span key={color} className="product-detail-color-pill">
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {fields.description ? (
                <div className="product-detail-description-box">
                  <p className="product-detail-description">{fields.description}</p>
                </div>
              ) : showDescriptionLoading ? (
                <div className="product-detail-agent-loading">
                  <div className="product-detail-skeleton-line h-4 w-full" />
                  <div className="product-detail-skeleton-line h-4 w-[88%]" />
                  <p className="product-detail-agent-loading-label">
                    Fetching more details from your agent...
                  </p>
                </div>
              ) : null}
              {fields.sizes?.length ? (
                <div className="product-detail-sizes">
                  <p className="product-detail-sizes-label">Available sizes</p>
                  <div className="product-detail-size-list">
                    {fields.sizes.map(size => (
                      <span key={size} className="product-detail-size-pill">
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {!loading.value && recommendations.value.length > 0 ? (
        <div className="product-detail-recommendations">
          <h3 className="product-detail-recommendations-title">
            You may also like
          </h3>
          <div className="product-detail-recommendations-track">
            {recommendations.value.map((item, index) => (
              <ProductRecommendationCard
                key={`${item.id ?? item.name}-${index}`}
                product={item}
                onSelect={nextProduct => {
                  openProductDetail(nextProduct);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {showCartActions ? (
        <div className="product-detail-actions">
          <button
            type="button"
            className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
            onClick={handleAddToCart}
            disabled={loading.value}
          >
            Add to cart
          </button>
        </div>
      ) : null}
    </div>
  );
}
