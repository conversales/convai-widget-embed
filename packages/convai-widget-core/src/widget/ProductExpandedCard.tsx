import { clsx } from "clsx";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../components/Icon";
import { useConversation } from "../contexts/conversation";
import { useProductDetailEnrichment } from "../hooks/useProductDetailEnrichment";
import { useProductCart } from "../contexts/product-cart";
import { useBusinessModeFeatures } from "../contexts/widget-config";
import { useWidgetStorageScope } from "../hooks/useWidgetStorageScope";
import type { ProductCardData } from "../types/product-card";
import { buildAddToCartMessages } from "../utils/product-display";
import { formatExpandedProductDescription } from "../utils/product-details";
import { formatProductPriceForDisplay } from "../utils/product-price-display";
import { notifyAgentOfExistingCart } from "../services/cart-sync";

interface ProductExpandedCardProps {
  product: ProductCardData;
  onCollapse?: () => void;
}

export function ProductExpandedCard({
  product,
  onCollapse,
}: ProductExpandedCardProps) {
  const features = useBusinessModeFeatures();
  const cart = useProductCart();
  const sessionScope = useWidgetStorageScope();
  const { sendUserMessage, sendContextualUpdate } = useConversation();
  const showCartActions = features.value.showCartActions;
  const imageLoaded = useSignal(false);
  const selectedColor = useSignal<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const { displayFields, loading, awaitingAgentDetails } =
    useProductDetailEnrichment(product);

  const fields = displayFields.value;
  const displayImageUrl = product.imageUrl || fields.imageUrl;

  useEffect(() => {
    imageLoaded.value = false;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      imageLoaded.value = true;
    }
  }, [displayImageUrl]);

  useEffect(() => {
    if (fields.colors.length === 0) {
      selectedColor.value = null;
      return;
    }

    if (
      !selectedColor.value ||
      !fields.colors.includes(selectedColor.value)
    ) {
      selectedColor.value = fields.colors[0] ?? null;
    }
  }, [fields.colors.join("|")]);

  const description = fields.description;
  const descriptionBullets = formatExpandedProductDescription(description, {
    omitAvailabilityLines: !features.value.showAvailability,
  });
  const showDescriptionLoading =
    awaitingAgentDetails.value && !description && !loading.value;
  const showDescription =
    !loading.value &&
    (descriptionBullets.length > 0 || showDescriptionLoading);
  const requiresColor = fields.colors.length > 0;
  const canAddToCart = !requiresColor || !!selectedColor.value;
  const displayPrice = formatProductPriceForDisplay(
    fields.price,
    features.value.priceDisplayMode
  );

  const buildCartProduct = (): ProductCardData => ({
    ...product,
    id: product.id,
    name: fields.name,
    price: fields.price,
    description: fields.description,
    imageUrl: displayImageUrl,
    category: fields.category,
    sizes: fields.sizes,
  });

  const handleAddToCart = () => {
    if (!canAddToCart) {
      return;
    }

    const color = selectedColor.value ?? undefined;
    const productPayload = buildCartProduct();

    cart.openAddToCart(productPayload);
    if (color) {
      cart.selectSize(color);
    }

    const item = cart.addToCart(color ?? cart.selectedSize.peek() ?? "");
    if (!item) {
      return;
    }

    const cartId = notifyAgentOfExistingCart(
      sendContextualUpdate,
      sessionScope.peek()
    );
    const { displayText, backendText } = buildAddToCartMessages(item.product, {
      color,
      size: !color ? item.size || undefined : undefined,
      cartId,
    });
    sendUserMessage(backendText, { displayText });
    onCollapse?.();
  };

  return (
    <article className="product-expanded-card">
      {loading.value ? (
        <div className="product-expanded-description-section">
          <div className="product-expanded-description-loading">
            <div className="product-card-skeleton-line h-3.5 w-full" />
            <div className="product-card-skeleton-line h-3.5 w-[92%]" />
            <div className="product-card-skeleton-line h-3.5 w-[84%]" />
          </div>
        </div>
      ) : showDescription ? (
        <div className="product-expanded-description-section">
          {descriptionBullets.length > 0 ? (
            <ul className="product-expanded-description-list">
              {descriptionBullets.map(bullet => (
                <li key={bullet} className="product-expanded-description-item">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : showDescriptionLoading ? (
            <div className="product-expanded-description-loading">
              <div className="product-card-skeleton-line h-3.5 w-full" />
              <div className="product-card-skeleton-line h-3.5 w-[92%]" />
              <div className="product-card-skeleton-line h-3.5 w-[84%]" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="product-expanded-product-card">
        <div className="product-expanded-main">
          <div className="product-expanded-media">
            {loading.value || !imageLoaded.value ? (
              <div
                className="product-expanded-media-skeleton"
                aria-hidden="true"
              />
            ) : null}
            {displayImageUrl ? (
              <img
                ref={imageRef}
                src={displayImageUrl}
                alt={fields.name}
                referrerPolicy="no-referrer"
                className={clsx(
                  "product-expanded-image",
                  imageLoaded.value && "product-expanded-image-loaded"
                )}
                onLoad={() => {
                  imageLoaded.value = true;
                }}
              />
            ) : (
              <div className="product-expanded-media-empty" aria-hidden="true" />
            )}
          </div>

          <div className="product-expanded-info">
            {loading.value ? (
              <>
                <div className="product-card-skeleton-line h-3.5 w-[90%]" />
                <div className="product-card-skeleton-line h-3.5 w-[45%]" />
                <div className="product-card-skeleton-line mt-1 h-7 w-full rounded-md" />
              </>
            ) : (
              <>
                <div className="product-expanded-info-head">
                  <h3 className="product-expanded-title">{fields.name}</h3>
                  {displayPrice ? (
                    <p className="product-expanded-price">{displayPrice}</p>
                  ) : null}
                  {features.value.showAvailability && fields.availability ? (
                    <p className="product-expanded-availability">
                      {fields.availability}
                    </p>
                  ) : null}
                </div>

                {fields.colors.length > 0 ? (
                  <div className="product-expanded-color-list">
                    {fields.colors.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={clsx(
                          "product-expanded-color-btn",
                          selectedColor.value === color &&
                            "product-expanded-color-btn-active"
                        )}
                        aria-pressed={selectedColor.value === color}
                        aria-label={`Color ${color}`}
                        title={color}
                        onClick={() => {
                          selectedColor.value = color;
                        }}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                ) : null}

                {fields.sizes?.length ? (
                  <div className="product-expanded-size-list">
                    {fields.sizes.map(size => (
                      <span key={size} className="product-expanded-size-pill">
                        {size}
                      </span>
                    ))}
                  </div>
                ) : null}

                {showCartActions ? (
                  <button
                    type="button"
                    className={clsx(
                      "product-expanded-add-btn",
                      !canAddToCart && "product-expanded-add-btn-disabled"
                    )}
                    disabled={!canAddToCart}
                    onClick={handleAddToCart}
                  >
                    <Icon name="plus" size="sm" />
                    Add to cart
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
