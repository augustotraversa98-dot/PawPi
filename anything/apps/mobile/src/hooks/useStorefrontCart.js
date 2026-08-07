import { useMemo, useState } from "react";
import { Alert, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { useShopProducts, useShopCheckout } from "@/hooks/useProviders";

// Cart + checkout logic for a store's storefront (PR-3a behavior-preserving extraction), moved
// VERBATIM out of StorefrontCatalog so BOTH the modal and (PR-3b) the inline browse surface can
// reuse the exact same money path: cart {productId:qty}, setQty clamp, cartLines, total,
// favorites, pickup/delivery fulfillment + address, canPay, and doCheckout (same useShopCheckout
// mutate, rail 'mercadopago', same fulfillment_type / shipping_address payload, same Alerts +
// Linking). The catalog owns the products fetch here so cartLines can resolve product rows.
//
// The ONLY difference from the pre-extraction version: on a successful redirect the post-success
// side effect clears the cart + closes the sheet (cart hygiene, intrinsic to the hook) and then
// calls the injected onComplete() in place of the hardcoded onClose() — so the modal passes
// onClose (closes itself) while PR-3b's inline surface can pass a no-op (it just resets). Nothing
// else changed.
export function useStorefrontCart(shop, petId, { onComplete } = {}) {
  const { t } = useTranslation();
  const { data: products, isLoading } = useShopProducts(shop?.id);
  const checkout = useShopCheckout();

  const [cart, setCart] = useState({}); // productId -> qty
  const [showCheckout, setShowCheckout] = useState(false);
  const [fulfillment, setFulfillment] = useState("pickup");
  const [address, setAddress] = useState(null); // { lat, lng, address }
  const [favorites, setFavorites] = useState(() => new Set());

  const canPay =
    fulfillment === "pickup" ||
    (fulfillment === "delivery" && !!address?.address?.trim());

  const reset = () => setCart({});

  const cartLines = useMemo(() => {
    if (!products) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([pid, qty]) => {
        const product = products.find((p) => String(p.id) === String(pid));
        return product ? { product, qty } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const total = cartLines.reduce(
    (sum, l) => sum + l.product.price_cents * l.qty,
    0,
  );

  const setQty = (productId, delta, stockQty) => {
    setCart((prev) => {
      const next = Math.max(0, Math.min(stockQty ?? 99, (prev[productId] ?? 0) + delta));
      return { ...prev, [productId]: next };
    });
  };

  const toggleFavorite = (id) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doCheckout = async () => {
    if (!petId) {
      Alert.alert(t("storefront.addPetTitle"), t("storefront.addPetBody"));
      return;
    }
    if (cartLines.length === 0) return;
    // Delivery requires an address (the server re-validates); guard here too.
    if (fulfillment === "delivery" && !address?.address?.trim()) return;
    try {
      // P4b: fulfillment_type + shipping_address are ADDITIVE on the SAME payload — the
      // rail (mercadopago) and every existing field are unchanged. A pickup order sends
      // 'pickup' + null, reproducing the pre-P4b request exactly.
      const res = await checkout.mutateAsync({
        petId,
        provider_id: shop.id,
        items: cartLines.map((l) => ({
          product_id: l.product.id,
          quantity: l.qty,
        })),
        rail: "mercadopago",
        fulfillment_type: fulfillment,
        shipping_address:
          fulfillment === "delivery"
            ? {
                address: address.address,
                lat: address.lat ?? null,
                lng: address.lng ?? null,
              }
            : null,
      });
      const payUrl = res.checkoutUrl || res.deeplink;
      if (payUrl) {
        // Send the buyer to MercadoPago. The order stays PENDING until the payment
        // webhook confirms it — so we must NOT tell them it's "placed"/on its way yet.
        Linking.openURL(payUrl).catch(() => {});
        Alert.alert(
          "Complete your payment",
          "Finish paying in MercadoPago to confirm your order. It isn't confirmed until your payment goes through.",
        );
        reset();
        setShowCheckout(false);
        onComplete?.();
      } else {
        // 201 but no checkout URL → payment could NOT be started. Never claim success:
        // nothing was charged. Keep the checkout sheet open so the buyer can retry.
        Alert.alert(
          "Payment couldn't start",
          "We couldn't open the payment window, so nothing was charged. Please try again.",
        );
      }
    } catch (e) {
      Alert.alert(
        t("storefront.checkoutFailedTitle"),
        e.message || t("storefront.checkoutFailedBody"),
      );
    }
  };

  return {
    products,
    isLoading,
    cart,
    cartLines,
    total,
    setQty,
    reset,
    favorites,
    toggleFavorite,
    fulfillment,
    setFulfillment,
    address,
    setAddress,
    canPay,
    showCheckout,
    setShowCheckout,
    doCheckout,
    checkout,
  };
}
