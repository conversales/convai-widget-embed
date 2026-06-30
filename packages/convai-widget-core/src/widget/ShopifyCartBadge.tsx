import { useShopifyCart } from "../contexts/shopify-cart";
import { useCartCommerceEnabled } from "../contexts/widget-config";

function ShopifyCartBadgeInner() {
  const shopifyCart = useShopifyCart();
  const count = shopifyCart.lineItemCount.value;

  if (count <= 0) {
    return null;
  }

  const label = count > 99 ? "99+" : String(count);

  return (
    <span className="shopify-cart-badge" aria-label={`${count} items in cart`}>
      {label}
    </span>
  );
}

export function ShopifyCartBadge() {
  const cartEnabled = useCartCommerceEnabled();

  if (!cartEnabled.value) {
    return null;
  }

  return <ShopifyCartBadgeInner />;
}
