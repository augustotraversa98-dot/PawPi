import React from "react";
import { View, Text, Modal } from "react-native";
import { X, Package } from "lucide-react-native";
import { PressableScale, GlassSurface } from "@/components/ui";
import { RADIUS, SPACING, MATERIALS, BLUR, TYPE } from "@/constants/theme";
import { COLORS } from "@/constants/colors";
import LocationField from "@/components/Map/LocationField";
import { money } from "./catalogShared";

// The pinned cart bar + the pickup/delivery checkout sheet (PR-3a extraction; presentational
// only). Both are driven entirely by useStorefrontCart's values/handlers, moved VERBATIM from
// StorefrontCatalog — same testIDs, same copy, same money path (nothing here touches checkout
// logic; it just calls the handlers the hook provides).

// Pinned cart bar — only shown when the cart has lines (the modal rendered it conditionally).
export function StorefrontCartBar({ visible, total, currency, onOpenCheckout, t }) {
  if (!visible) return null;
  return (
    <GlassSurface
      intensity={BLUR.thick}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopWidth: 1,
        borderColor: MATERIALS.glassBorder,
      }}
      contentStyle={{ padding: SPACING.lg }}
    >
      <PressableScale
        testID="storefront-checkout"
        onPress={onOpenCheckout}
        style={{
          backgroundColor: COLORS.coral,
          borderRadius: RADIUS.control,
          paddingVertical: 15,
          alignItems: "center",
        }}
      >
        <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
          {t("storefront.checkoutTotal", { total: money(total, currency) })}
        </Text>
      </PressableScale>
    </GlassSurface>
  );
}

// Checkout sheet (P4b): choose Pickup or Delivery, add an address for delivery, then Pay via the
// EXISTING checkout (onPay = the hook's doCheckout).
export function StorefrontCheckoutSheet({
  visible,
  onClose,
  fulfillment,
  onSelectFulfillment,
  address,
  onChangeAddress,
  canPay,
  isPending,
  total,
  currency,
  storeName,
  onPay,
  t,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: RADIUS.card,
            borderTopRightRadius: RADIUS.card,
            padding: SPACING.lg,
            paddingBottom: SPACING.xxl,
            maxHeight: "88%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.md,
            }}
          >
            <Text style={[TYPE.title2, { fontSize: 18, color: COLORS.warmBrown }]}>
              {t("storefront.checkout")}
            </Text>
            <PressableScale
              testID="storefront-checkout-close"
              onPress={onClose}
              accessibilityLabel={t("common.close")}
            >
              <X size={22} color={COLORS.warmBrown} />
            </PressableScale>
          </View>

          {/* Pickup / Delivery toggle */}
          <View style={{ flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md }}>
            {[
              { key: "pickup", label: t("storefront.pickup") },
              { key: "delivery", label: t("storefront.delivery") },
            ].map(({ key, label }) => {
              const selected = fulfillment === key;
              return (
                <PressableScale
                  key={key}
                  testID={`storefront-fulfillment-${key}`}
                  onPress={() => onSelectFulfillment(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: SPACING.md,
                    borderRadius: RADIUS.control,
                    borderWidth: 1.5,
                    borderColor: selected ? COLORS.coral : COLORS.peach,
                    backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
                  }}
                >
                  <Text
                    style={[
                      TYPE.headline,
                      { fontWeight: "800", color: selected ? COLORS.coral : COLORS.mutedBrown },
                    ]}
                  >
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {fulfillment === "pickup" ? (
            <View
              testID="storefront-pickup-info"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm,
                padding: SPACING.md,
                backgroundColor: COLORS.sand,
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: COLORS.peach,
                marginBottom: SPACING.md,
              }}
            >
              <Package size={16} color={COLORS.mutedBrown} />
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, flex: 1, fontWeight: "500" }]}>
                {t("storefront.pickupInfo", { store: storeName || t("storefront.shop") })}
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: SPACING.md }}>
              <LocationField
                value={address}
                onChange={onChangeAddress}
                label={t("storefront.deliveryAddress")}
              />
            </View>
          )}

          <PressableScale
            testID="storefront-pay"
            onPress={onPay}
            disabled={!canPay || isPending}
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: 15,
              alignItems: "center",
              opacity: !canPay || isPending ? 0.6 : 1,
            }}
          >
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {isPending
                ? t("storefront.checkingOut")
                : t("storefront.payTotal", { total: money(total, currency) })}
            </Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}
