import { clsx } from "clsx";
import type { ComponentChildren } from "preact";
import { useComputed } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { Icon } from "../components/Icon";
import {
  formatDeliveryAddress,
  useProductCart,
} from "../contexts/product-cart";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { formatSavedAddressLines } from "../utils/widget-address-storage";
import { isAddToCartUserMessage, buildAddToCartMessages } from "../utils/product-display";
import { useWidgetStorageScope } from "../hooks/useWidgetStorageScope";
import { notifyAgentOfExistingCart } from "../services/cart-sync";
import type { CartItem, CheckoutStep } from "../types/product-card";
import type { TranscriptEntry } from "../contexts/conversation";

const STEPS_AFTER_EMAIL: CheckoutStep[] = [
  "address",
  "discount",
  "review",
  "complete",
];

const STEPS_AFTER_ADDRESS: CheckoutStep[] = ["discount", "review", "complete"];

function requestCheckoutFromAgent(
  sendUserMessage: (
    text: string,
    options?: { silent?: boolean }
  ) => void,
  isDisconnected: boolean,
  startSession: (
    element: HTMLElement,
    message: string,
    options?: { silent?: boolean }
  ) => Promise<unknown>,
  element: HTMLElement
) {
  const message = "continue payment";
  if (isDisconnected) {
    void startSession(element, message, { silent: true });
    return;
  }
  sendUserMessage(message, { silent: true });
}

function CheckoutPaymentWatcher() {
  const cart = useProductCart();
  const { transcript } = useConversation();

  useSignalEffect(() => {
    cart.checkoutStep.value;
    cart.paymentStatus.value;
    transcript.value;
    cart.syncCheckoutFromTranscript(transcript.peek());
  });

  return null;
}

function hasAgentResponseAfterAddToCart(entries: TranscriptEntry[]): boolean {
  let lastAddIndex = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (
      entry.type === "message" &&
      entry.role === "user" &&
      isAddToCartUserMessage(entry.message, entry.displayMessage)
    ) {
      lastAddIndex = index;
    }
  }

  if (lastAddIndex === -1) {
    return false;
  }

  for (let index = lastAddIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.role !== "agent") {
      continue;
    }
    if (!entry.message?.trim()) {
      continue;
    }
    if (entry.isStreaming) {
      return false;
    }
    return true;
  }

  return false;
}

function CartConfirmationWatcher() {
  const cart = useProductCart();
  const { transcript, isDisconnected } = useConversation();

  useSignalEffect(() => {
    if (cart.checkoutStep.value !== "cart_pending") {
      return;
    }

    if (isDisconnected.value) {
      cart.revealCartConfirmation();
      return;
    }

    if (hasAgentResponseAfterAddToCart(transcript.value)) {
      cart.syncCheckoutFromTranscript(transcript.peek());
      cart.revealCartConfirmation();
    }
  });

  return null;
}

function AddToCartChatCard() {
  const cart = useProductCart();
  const sessionScope = useWidgetStorageScope();
  const { sendUserMessage, sendContextualUpdate } = useConversation();
  const product = cart.pendingProduct.value;
  const sizes = product ? cart.getSizes(product) : [];
  const requiresSize = sizes.length > 0;
  const canAdd = requiresSize ? !!cart.selectedSize.value : true;

  if (!product) {
    return null;
  }

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <span>Add to cart</span>
      </div>

      <div className="product-cart-modal-product">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="product-cart-modal-thumb"
          />
        ) : (
          <div className="product-cart-modal-thumb product-cart-modal-thumb-empty" />
        )}
        <div className="min-w-0">
          <div className="product-cart-modal-name">{product.name}</div>
          {product.price && (
            <div className="product-cart-modal-price">{product.price}</div>
          )}
        </div>
      </div>

      {requiresSize ? (
        <div className="product-cart-modal-section">
          <div className="product-cart-modal-label">Select Size</div>
          <div className="product-cart-size-grid">
            {sizes.map(size => (
              <button
                key={size}
                type="button"
                className={clsx(
                  "product-cart-size-btn",
                  cart.selectedSize.value === size && "product-cart-size-btn-active"
                )}
                onClick={() => {
                  cart.selectSize(size);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="product-cart-modal-actions">
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-outline"
          onClick={cart.skipAddToCart}
        >
          SKIP
        </button>
        <button
          type="button"
          className={clsx(
            "product-cart-flow-btn",
            canAdd
              ? "product-cart-flow-btn-primary"
              : "product-cart-flow-btn-disabled"
          )}
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd) {
              return;
            }
            const item = cart.addToCart(cart.selectedSize.value ?? "");
            if (item) {
              const cartId = notifyAgentOfExistingCart(
                sendContextualUpdate,
                sessionScope.peek()
              );
              const { displayText, backendText } = buildAddToCartMessages(
                item.product,
                {
                  size: item.size || undefined,
                  cartId,
                }
              );
              sendUserMessage(backendText, { displayText });
            }
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}

function CartItemSummary({ item }: { item: CartItem }) {
  return (
    <div className="product-cart-item-summary">
      {item.product.imageUrl ? (
        <img
          src={item.product.imageUrl}
          alt={item.product.name}
          className="product-cart-item-thumb"
        />
      ) : (
        <div className="product-cart-item-thumb product-cart-item-thumb-empty" />
      )}
      <div className="min-w-0 flex-1">
        <div className="product-cart-item-name">{item.product.name}</div>
        {item.product.price && (
          <div className="product-cart-item-price">{item.product.price}</div>
        )}
        {item.size ? (
          <div className="product-cart-size-pill">Size : {item.size}</div>
        ) : null}
      </div>
    </div>
  );
}

function CartConfirmationCard() {
  const cart = useProductCart();
  const { sendUserMessage, isDisconnected, startSession } = useConversation();
  const latestItem = cart.latestItem.value;
  const checkoutReady =
    cart.paymentStatus.value === "ready" && !!cart.checkoutUrl.value;
  const checkoutPending = cart.paymentStatus.value === "processing";

  if (!latestItem) {
    return null;
  }

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-confirmation-header">
        <span className="product-cart-success-icon" aria-hidden="true">
          <Icon name="check" size="sm" />
        </span>
        <span className="product-cart-confirmation-title">
          {cart.itemCount.value} Items added to the cart
        </span>
      </div>
      <CartItemSummary item={latestItem} />
      {checkoutReady ? (
        <p className="product-cart-complete-banner">
          Your checkout link is ready.
        </p>
      ) : null}
      <button
        type="button"
        className={clsx(
          "product-cart-flow-btn product-cart-flow-btn-wide",
          checkoutReady
            ? "product-cart-checkout-link"
            : "product-cart-flow-btn-outline"
        )}
        disabled={checkoutPending}
        onClick={event => {
          if (cart.openCheckoutInNewTab()) {
            return;
          }
          cart.requestDirectCheckout();
          if (isDisconnected.value) {
            void startSession(event.currentTarget, "continue payment", {
              silent: true,
            });
            return;
          }
          requestCheckoutFromAgent(
            sendUserMessage,
            isDisconnected.value,
            startSession,
            event.currentTarget
          );
        }}
      >
        {checkoutPending
          ? "Preparing checkout..."
          : checkoutReady
            ? "Proceed to checkout"
            : "Proceed to checkout"}
      </button>
    </div>
  );
}

function StepActions({
  children,
}: {
  children: ComponentChildren;
}) {
  return <div className="product-cart-step-actions">{children}</div>;
}

function VerifiedRow({
  label,
  onEdit,
}: {
  label: string;
  onEdit: () => void;
}) {
  return (
    <div className="product-cart-verified-row">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="product-cart-success-icon" aria-hidden="true">
          <Icon name="check" size="sm" />
        </span>
        <span className="product-cart-verified-label">{label}</span>
      </div>
      <button type="button" className="product-cart-edit-link" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

function CheckoutEmailStep() {
  const cart = useProductCart();

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <span aria-hidden="true">✉️</span>
        <span>What&apos;s your email?</span>
      </div>
      <input
        type="email"
        className="product-cart-input"
        placeholder="you@example.com"
        value={cart.email.value}
        onInput={event => {
          cart.email.value = event.currentTarget.value;
        }}
      />
      <StepActions>
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
          disabled={!cart.email.value.trim()}
          onClick={cart.continueCheckout}
        >
          Continue
        </button>
        <button
          type="button"
          className="product-cart-cancel-link"
          onClick={cart.cancelCheckout}
        >
          Cancel
        </button>
      </StepActions>
    </div>
  );
}

function CheckoutSavedAddressStep() {
  const cart = useProductCart();
  const text = useTextContents();
  const saved = cart.savedAddressForEmail.value;

  if (!saved) {
    return null;
  }

  const lines = formatSavedAddressLines(saved);

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <span aria-hidden="true">📍</span>
        <span>Where should we deliver?</span>
      </div>
      <div className="product-cart-saved-address-block">
        <div className="product-cart-saved-address-label">{text.saved_address}</div>
        <div className="product-cart-saved-address-lines">
          {lines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      </div>
      <StepActions>
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
          onClick={cart.useSavedAddress}
        >
          {text.use_saved_address}
        </button>
        <button
          type="button"
          className="product-cart-secondary-link"
          onClick={cart.enterDifferentAddress}
        >
          {text.enter_different_address}
        </button>
        <button
          type="button"
          className="product-cart-cancel-link"
          onClick={cart.cancelCheckout}
        >
          Cancel
        </button>
      </StepActions>
    </div>
  );
}

function CheckoutAddressStep() {
  const cart = useProductCart();
  const canContinue = useComputed(
    () =>
      !!cart.fullName.value.trim() &&
      !!cart.street.value.trim() &&
      !!cart.city.value.trim() &&
      !!cart.state.value.trim() &&
      !!cart.pin.value.trim() &&
      !!cart.phone.value.trim()
  );

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <span aria-hidden="true">📍</span>
        <span>Where should we deliver?</span>
      </div>
      <div className="product-cart-form-stack">
        <input
          type="text"
          className="product-cart-input"
          placeholder="Full name"
          value={cart.fullName.value}
          onInput={event => {
            cart.fullName.value = event.currentTarget.value;
          }}
        />
        <input
          type="text"
          className="product-cart-input"
          placeholder="Street address"
          value={cart.street.value}
          onInput={event => {
            cart.street.value = event.currentTarget.value;
          }}
        />
        <div className="product-cart-form-grid">
          <input
            type="text"
            className="product-cart-input"
            placeholder="City"
            value={cart.city.value}
            onInput={event => {
              cart.city.value = event.currentTarget.value;
            }}
          />
          <input
            type="text"
            className="product-cart-input"
            placeholder="State"
            value={cart.state.value}
            onInput={event => {
              cart.state.value = event.currentTarget.value;
            }}
          />
        </div>
        <div className="product-cart-form-grid">
          <input
            type="text"
            className="product-cart-input"
            placeholder="PIN / Postal code"
            value={cart.pin.value}
            onInput={event => {
              cart.pin.value = event.currentTarget.value;
            }}
          />
          <input
            type="tel"
            className="product-cart-input"
            placeholder="Phone number"
            value={cart.phone.value}
            onInput={event => {
              cart.phone.value = event.currentTarget.value;
            }}
          />
        </div>
      </div>
      <StepActions>
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
          disabled={!canContinue.value}
          onClick={cart.continueCheckout}
        >
          Continue
        </button>
        <button
          type="button"
          className="product-cart-cancel-link"
          onClick={cart.cancelCheckout}
        >
          Cancel
        </button>
      </StepActions>
    </div>
  );
}

function CheckoutDiscountStep() {
  const cart = useProductCart();

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <span aria-hidden="true">🏷️</span>
        <span>Got a discount code?</span>
      </div>
      <input
        type="text"
        className="product-cart-input"
        placeholder="e.g. WELCOME10 (optional)"
        value={cart.discountCode.value}
        onInput={event => {
          cart.discountCode.value = event.currentTarget.value;
        }}
      />
      <StepActions>
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
          onClick={() => {
            cart.continueCheckout();
          }}
        >
          Continue
        </button>
        <button
          type="button"
          className="product-cart-cancel-link"
          onClick={cart.cancelCheckout}
        >
          Cancel
        </button>
      </StepActions>
    </div>
  );
}

function CheckoutReviewStep() {
  const cart = useProductCart();
  const address = cart.deliveryAddress.value;
  const shipTo = [
    address.fullName.trim(),
    address.street.trim(),
    `${address.city.trim()}, ${address.state.trim()} ${address.pin.trim()}`
      .replace(/\s+/g, " ")
      .trim(),
    `${address.countryCode.trim()}${address.phone.trim() ? ` · ${address.phone.trim()}` : ""}`,
  ].filter(Boolean);

  return (
    <div className="product-cart-flow-card">
      <div className="product-cart-step-title">
        <Icon name="star" size="sm" className="shrink-0 text-base-primary" />
        <span>Review your order</span>
      </div>
      <div className="product-cart-review-panel">
        <div className="product-cart-review-row">
          <span className="product-cart-review-label">Email</span>
          <span className="product-cart-review-value">{cart.email.value.trim()}</span>
        </div>
        <div className="product-cart-review-row">
          <span className="product-cart-review-label">Ship to</span>
          <div className="product-cart-review-address">
            {shipTo.map((line, index) => (
              <span key={`${line}-${index}`} className="product-cart-review-value">
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
      <StepActions>
        <p className="product-cart-review-note">
          Payment is collected on the next screen.
        </p>
        <button
          type="button"
          className="product-cart-flow-btn product-cart-flow-btn-primary product-cart-flow-btn-wide"
          onClick={() => {
            cart.continueCheckout();
          }}
        >
          Continue to payment
        </button>
        <button
          type="button"
          className="product-cart-cancel-link"
          onClick={cart.cancelCheckout}
        >
          Cancel
        </button>
      </StepActions>
    </div>
  );
}

function CheckoutCompleteBanner() {
  const cart = useProductCart();
  const paymentStatus = cart.paymentStatus.value;
  const checkoutStep = cart.checkoutStep.value;

  const bannerText =
    paymentStatus === "ready"
      ? "Your checkout link is ready."
      : "Preparing your checkout link...";

  const canOpenCheckout =
    checkoutStep === "complete" &&
    (paymentStatus === "ready" || paymentStatus === "processing");

  return (
    <div className="product-cart-complete-panel">
      <div className="product-cart-complete-banner">{bannerText}</div>
      {canOpenCheckout ? (
        <button
          type="button"
          className="product-cart-checkout-link"
          disabled={paymentStatus === "processing"}
          onClick={() => {
            cart.openCheckoutInNewTab();
          }}
        >
          Proceed to checkout
        </button>
      ) : null}
    </div>
  );
}

export function ProductCartTranscriptCards() {
  const cart = useProductCart();
  const step = cart.checkoutStep.value;

  if (step === "none") {
    return null;
  }

  const showDirectCheckout =
    step === "confirmation" ||
    step === "complete" ||
    step === "cart_pending";

  return (
    <div className="product-cart-chat-flow flex flex-col">
      <CheckoutPaymentWatcher />
      <CartConfirmationWatcher />
      {step === "add_to_cart" && <AddToCartChatCard />}
      {showDirectCheckout && <CartConfirmationCard />}
    </div>
  );
}
