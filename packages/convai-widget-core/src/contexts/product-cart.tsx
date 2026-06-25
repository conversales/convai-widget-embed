import { computed, signal } from "@preact/signals";
import { ComponentChildren } from "preact";
import { createContext, useMemo, useRef, useEffect } from "preact/compat";
import { useSignalEffect } from "@preact/signals";
import {
  type CartItem,
  type CheckoutStep,
  type DeliveryAddress,
  type PaymentStatus,
  type ProductCardData,
} from "../types/product-card";
import { useContextSafely } from "../utils/useContextSafely";
import { useConversation } from "./conversation";
import { useAttribute } from "./attributes";
import { useWidgetStorageScope } from "../hooks/useWidgetStorageScope";
import {
  createEmptyCartState,
  getWidgetSessionScope,
  loadWidgetSession,
  type PersistedCartState,
  updateWidgetSession,
} from "../utils/widget-session-storage";
import {
  getSavedAddressForEmail,
  hasCompleteAddress,
  saveAddressForEmail,
} from "../utils/widget-address-storage";
import { resolveCheckoutUrl, CHECKOUT_FLOW_STEPS } from "../utils/checkout";
import { findCheckoutUrlInTranscript } from "../utils/agent-response";
import { addVariantToThemeCart } from "../utils/shopify-theme-cart";

type ProductCartSetup = ReturnType<typeof useProductCartSetup>;

const ProductCartContext = createContext<ProductCartSetup | null>(null);

interface ProductCartProviderProps {
  children: ComponentChildren;
}

function createCartItemId(productName: string, size: string) {
  return size ? `${productName}::${size}` : productName;
}

export function formatDeliveryAddress(address: DeliveryAddress): string {
  const parts = [
    address.fullName,
    address.street,
    address.city,
    address.state,
    address.pin,
    address.countryCode,
  ]
    .map(part => part.trim())
    .filter(Boolean);
  const summary = parts.join(", ");
  if (address.phone.trim()) {
    return `${summary} · ${address.phone.trim()}`;
  }
  return summary;
}

function getCartSnapshot(state: {
  items: CartItem[];
  checkoutStep: CheckoutStep;
  paymentStatus: PaymentStatus;
  checkoutUrl: string | null;
  email: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  countryCode: string;
  discountCode: string;
  pendingProduct: ProductCardData | null;
  selectedSize: string | null;
}): PersistedCartState {
  return {
    items: state.items,
    checkoutStep: state.checkoutStep,
    paymentStatus: state.paymentStatus,
    checkoutUrl: state.checkoutUrl,
    email: state.email,
    fullName: state.fullName,
    street: state.street,
    city: state.city,
    state: state.state,
    pin: state.pin,
    phone: state.phone,
    countryCode: state.countryCode,
    discountCode: state.discountCode,
    pendingProduct: state.pendingProduct,
    selectedSize: state.selectedSize,
  };
}

function useProductCartSetup(sessionScope: string) {
  const items = signal<CartItem[]>([]);
  const pendingProduct = signal<ProductCardData | null>(null);
  const selectedSize = signal<string | null>(null);
  const checkoutStep = signal<CheckoutStep>("none");
  const paymentStatus = signal<PaymentStatus>("idle");
  const checkoutUrl = signal<string | null>(null);

  const email = signal("");
  const fullName = signal("");
  const street = signal("");
  const city = signal("");
  const state = signal("");
  const pin = signal("");
  const phone = signal("");
  const countryCode = signal("IN");
  const discountCode = signal("");
  const addressEntryMode = signal<"saved" | "new">("new");

  const latestItem = computed(() => items.value[items.value.length - 1] ?? null);
  const itemCount = computed(() => items.value.length);

  const cartProductKeys = computed(() =>
    new Set(items.value.map(item => item.product.name))
  );

  const deliveryAddress = computed<DeliveryAddress>(() => ({
    fullName: fullName.value,
    street: street.value,
    city: city.value,
    state: state.value,
    pin: pin.value,
    phone: phone.value,
    countryCode: countryCode.value,
  }));

  const savedAddressForEmail = computed(() =>
    getSavedAddressForEmail(sessionScope, email.value)
  );

  const showSavedAddressStep = computed(
    () =>
      checkoutStep.value === "address" &&
      addressEntryMode.value === "saved" &&
      hasCompleteAddress(savedAddressForEmail.value)
  );

  const canProceedToPayment = computed(
    () => checkoutStep.value === "complete" && paymentStatus.value === "idle"
  );

  const isAwaitingCheckoutUrl = computed(
    () => checkoutStep.value === "complete" && paymentStatus.value === "processing"
  );

  const applyDeliveryAddress = (address: DeliveryAddress) => {
    fullName.value = address.fullName;
    street.value = address.street;
    city.value = address.city;
    state.value = address.state;
    pin.value = address.pin;
    phone.value = address.phone;
    countryCode.value = address.countryCode || "IN";
  };

  const clearDeliveryAddressFields = () => {
    fullName.value = "";
    street.value = "";
    city.value = "";
    state.value = "";
    pin.value = "";
    phone.value = "";
    countryCode.value = "IN";
  };

  const syncAddressEntryMode = () => {
    addressEntryMode.value = hasCompleteAddress(
      getSavedAddressForEmail(sessionScope, email.peek())
    )
      ? "saved"
      : "new";
  };

  const applyCartState = (cart: PersistedCartState) => {
    items.value = cart.items;
    checkoutStep.value = cart.checkoutStep;
    paymentStatus.value = cart.paymentStatus ?? "idle";
    checkoutUrl.value = cart.checkoutUrl ?? null;
    email.value = cart.email;
    fullName.value = cart.fullName;
    street.value = cart.street;
    city.value = cart.city;
    state.value = cart.state;
    pin.value = cart.pin;
    phone.value = cart.phone;
    countryCode.value = cart.countryCode || "IN";
    discountCode.value = cart.discountCode;
    pendingProduct.value = cart.pendingProduct;
    selectedSize.value = cart.selectedSize;
    if (cart.checkoutStep === "address") {
      addressEntryMode.value = hasCompleteAddress(
        getSavedAddressForEmail(sessionScope, cart.email)
      )
        ? "saved"
        : "new";
    } else {
      addressEntryMode.value = "new";
    }
  };

  const persistCart = () => {
    updateWidgetSession(sessionScope, {
      cart: getCartSnapshot({
        items: items.peek(),
        checkoutStep: checkoutStep.peek(),
        paymentStatus: paymentStatus.peek(),
        checkoutUrl: checkoutUrl.peek(),
        email: email.peek(),
        fullName: fullName.peek(),
        street: street.peek(),
        city: city.peek(),
        state: state.peek(),
        pin: pin.peek(),
        phone: phone.peek(),
        countryCode: countryCode.peek(),
        discountCode: discountCode.peek(),
        pendingProduct: pendingProduct.peek(),
        selectedSize: selectedSize.peek(),
      }),
    });
  };

  const openAddToCart = (product: ProductCardData) => {
    pendingProduct.value = product;
    selectedSize.value = null;
    checkoutStep.value = "add_to_cart";
    persistCart();
  };

  const cancelAddToCart = () => {
    pendingProduct.value = null;
    selectedSize.value = null;
    checkoutStep.value = items.value.length > 0 ? "confirmation" : "none";
    persistCart();
  };

  const selectSize = (size: string) => {
    selectedSize.value = size;
    persistCart();
  };

  const addToCart = (size: string) => {
    const product = pendingProduct.value;
    if (!product) {
      return null;
    }

    const item: CartItem = {
      id: createCartItemId(product.name, size),
      product,
      size,
    };

    const existingIndex = items.value.findIndex(entry => entry.id === item.id);
    if (existingIndex === -1) {
      items.value = [...items.value, item];
    }

    pendingProduct.value = null;
    selectedSize.value = null;
    checkoutStep.value = "cart_pending";
    persistCart();

    if (product.id) {
      void addVariantToThemeCart(product.id, 1);
    }

    return item;
  };

  const revealCartConfirmation = () => {
    checkoutStep.value = items.peek().length > 0 ? "confirmation" : "none";
    persistCart();
  };

  const skipAddToCart = () => {
    cancelAddToCart();
  };

  const isInCart = (productName: string) => cartProductKeys.value.has(productName);

  const isCartActive = (productName: string) =>
    (checkoutStep.value === "add_to_cart" &&
      pendingProduct.value?.name === productName) ||
    isInCart(productName);

  const startCheckout = () => {
    checkoutStep.value = "email";
    beginCheckoutUrlRequest();
  };

  const continueCheckout = () => {
    const step = checkoutStep.value;
    if (step === "email") {
      syncAddressEntryMode();
      checkoutStep.value = "address";
      persistCart();
      return;
    }
    if (step === "address") {
      saveAddressForEmail(
        sessionScope,
        email.peek(),
        deliveryAddress.peek()
      );
      checkoutStep.value = "discount";
      persistCart();
      return;
    }
    if (step === "discount") {
      checkoutStep.value = "review";
      persistCart();
      return;
    }
    if (step === "review") {
      checkoutStep.value = "complete";
      persistCart();
    }
  };

  const cancelCheckout = () => {
    checkoutStep.value = items.value.length > 0 ? "confirmation" : "none";
    persistCart();
  };

  const editCheckoutStep = (step: CheckoutStep) => {
    if (step === "address") {
      syncAddressEntryMode();
    }
    checkoutStep.value = step;
    persistCart();
  };

  const useSavedAddress = () => {
    const saved = savedAddressForEmail.value;
    if (!saved) {
      return;
    }

    applyDeliveryAddress(saved);
    checkoutStep.value = "discount";
    persistCart();
  };

  const enterDifferentAddress = () => {
    addressEntryMode.value = "new";
    clearDeliveryAddressFields();
    persistCart();
  };

  const beginCheckoutUrlRequest = () => {
    if (!CHECKOUT_FLOW_STEPS.includes(checkoutStep.peek())) {
      return false;
    }

    if (paymentStatus.peek() === "ready" && checkoutUrl.peek()) {
      return false;
    }

    paymentStatus.value = "processing";
    persistCart();
    return true;
  };

  const beginAwaitingCheckout = () => beginCheckoutUrlRequest();

  const applyCheckoutUrlFromResponse = (responseUrl: string | null | undefined) => {
    const resolved = getResolvedCheckoutUrl(responseUrl ?? undefined);
    if (!resolved) {
      return false;
    }

    checkoutUrl.value = resolved;
    paymentStatus.value = "ready";
    persistCart();
    return true;
  };

  const getResolvedCheckoutUrl = (responseUrl?: string) => {
    const source = responseUrl ?? checkoutUrl.peek();
    if (!source) {
      return null;
    }

    return resolveCheckoutUrl(source, {
      items: items.peek(),
      email: email.peek(),
      discountCode: discountCode.peek(),
      deliveryAddress: deliveryAddress.peek(),
    });
  };

  const openCheckoutInNewTab = (responseUrl?: string) => {
    const resolved = getResolvedCheckoutUrl(responseUrl);
    if (!resolved) {
      return false;
    }

    checkoutUrl.value = resolved;
    paymentStatus.value = "ready";
    persistCart();
    window.open(resolved, "_blank", "noopener,noreferrer");
    return true;
  };

  const handleContinuePaymentRequest = () => {
    if (paymentStatus.peek() === "ready" && checkoutUrl.peek()) {
      openCheckoutInNewTab();
      return true;
    }

    if (!CHECKOUT_FLOW_STEPS.includes(checkoutStep.peek())) {
      return false;
    }

    beginCheckoutUrlRequest();
    return false;
  };

  const syncCheckoutFromTranscript = (
    entries: Array<{ type: string; role?: string; message?: string }>
  ) => {
    if (!CHECKOUT_FLOW_STEPS.includes(checkoutStep.peek())) {
      return false;
    }

    if (
      paymentStatus.peek() !== "processing" &&
      paymentStatus.peek() !== "idle"
    ) {
      return false;
    }

    const responseUrl = findCheckoutUrlInTranscript(entries);
    if (!responseUrl) {
      return false;
    }

    return applyCheckoutUrlFromResponse(responseUrl);
  };

  const exitCheckoutFlow = () => {
    const step = checkoutStep.peek();
    const checkoutSteps: CheckoutStep[] = [
      "email",
      "address",
      "discount",
      "review",
      "complete",
    ];
    if (!checkoutSteps.includes(step)) {
      return;
    }

    paymentStatus.value = "idle";
    checkoutUrl.value = null;
    checkoutStep.value = items.peek().length > 0 ? "confirmation" : "none";
    persistCart();
  };

  const resetSession = () => {
    addressEntryMode.value = "new";
    applyCartState(createEmptyCartState());
    updateWidgetSession(sessionScope, { cart: createEmptyCartState() });
  };

  const getSizes = (product: ProductCardData) =>
    product.sizes?.map(size => size.trim()).filter(Boolean) ?? [];

  const productRequiresSize = (product: ProductCardData) =>
    getSizes(product).length > 0;

  return {
    items,
    pendingProduct,
    selectedSize,
    checkoutStep,
    paymentStatus,
    checkoutUrl,
    canProceedToPayment,
    isAwaitingCheckoutUrl,
    email,
    fullName,
    street,
    city,
    state,
    pin,
    phone,
    countryCode,
    discountCode,
    deliveryAddress,
    savedAddressForEmail,
    showSavedAddressStep,
    addressEntryMode,
    latestItem,
    itemCount,
    openAddToCart,
    cancelAddToCart,
    selectSize,
    addToCart,
    skipAddToCart,
    revealCartConfirmation,
    isInCart,
    isCartActive,
    startCheckout,
    continueCheckout,
    cancelCheckout,
    editCheckoutStep,
    useSavedAddress,
    enterDifferentAddress,
    beginAwaitingCheckout,
    beginCheckoutUrlRequest,
    applyCheckoutUrlFromResponse,
    syncCheckoutFromTranscript,
    getResolvedCheckoutUrl,
    openCheckoutInNewTab,
    handleContinuePaymentRequest,
    exitCheckoutFlow,
    resetSession,
    applyCartState,
    persistCart,
    getSizes,
    productRequiresSize,
    formatDeliveryAddress,
  };
}

function CheckoutFlowLifecycle({ cart }: { cart: ProductCartSetup }) {
  const { isDisconnected, transcript } = useConversation();

  useSignalEffect(() => {
    if (isDisconnected.value) {
      cart.exitCheckoutFlow();
      return;
    }

    const entries = transcript.value;
    const last = entries[entries.length - 1];
    if (last?.type === "disconnection" || last?.type === "error") {
      cart.exitCheckoutFlow();
      return;
    }

    if (entries.length >= 2) {
      const newest = entries[entries.length - 1];
      const previous = entries[entries.length - 2];
      if (
        newest.type === "message" &&
        newest.role === "user" &&
        (previous.type === "disconnection" || previous.type === "error")
      ) {
        cart.exitCheckoutFlow();
      }
    }
  });

  return null;
}

export function ProductCartProvider({ children }: ProductCartProviderProps) {
  const agentId = useAttribute("agent-id");
  const signedUrl = useAttribute("signed-url");
  const sessionScope = useWidgetStorageScope();
  const restoredRef = useRef(false);
  const value = useMemo(
    () => useProductCartSetup(sessionScope.value),
    [sessionScope.value]
  );

  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;

    const saved = loadWidgetSession(sessionScope.value);
    if (saved?.cart) {
      value.applyCartState(saved.cart);
    }
  }, [sessionScope.value, value]);

  useSignalEffect(() => {
    if (!restoredRef.current) {
      return;
    }

    value.items.value;
    value.checkoutStep.value;
    value.paymentStatus.value;
    value.checkoutUrl.value;
    value.email.value;
    value.fullName.value;
    value.street.value;
    value.city.value;
    value.state.value;
    value.pin.value;
    value.phone.value;
    value.countryCode.value;
    value.discountCode.value;
    value.pendingProduct.value;
    value.selectedSize.value;
    value.persistCart();
  });

  return (
    <ProductCartContext.Provider value={value}>
      <CheckoutFlowLifecycle cart={value} />
      {children}
    </ProductCartContext.Provider>
  );
}

export function useProductCart() {
  return useContextSafely(ProductCartContext);
}
