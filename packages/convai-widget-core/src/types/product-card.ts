export type ProductCardData = {
  id?: string;
  name: string;
  price?: string;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
  category?: string;
  sizes?: string[];
};

export const DEFAULT_PRODUCT_SIZES = [
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
] as const;

export type CartItem = {
  id: string;
  product: ProductCardData;
  size: string;
};

export type CheckoutStep =
  | "none"
  | "add_to_cart"
  | "cart_pending"
  | "confirmation"
  | "email"
  | "address"
  | "discount"
  | "review"
  | "complete";

export type PaymentStatus = "idle" | "processing" | "ready";

export type DeliveryAddress = {
  fullName: string;
  street: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  countryCode: string;
};
