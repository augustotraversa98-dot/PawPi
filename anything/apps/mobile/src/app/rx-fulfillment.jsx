import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Pill, Truck, Store } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import LocationField from "@/components/Map/LocationField";
import { useDiscoverProviders } from "@/hooks/useProviders";
import {
  useRxFulfillmentOrders,
  useRequestFulfillment,
} from "@/hooks/useRxFulfillment";

// Rx fulfillment request (ticket 2.71). From an active prescription, the owner picks a
// `pharmacy`-capable provider, chooses delivery (address on the 2.68 map) or pickup, requests
// fulfillment, then sees the price the provider sets and pays via the existing 2.3 rail. Real data
// only — empty states when no pharmacy providers exist. The clinical Rx is never edited here.

const STATUS_LABEL = {
  requested: "Requested",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

function money(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function RxFulfillmentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const prescriptionId = Array.isArray(params.prescriptionId)
    ? params.prescriptionId[0]
    : params.prescriptionId;
  const petId = Array.isArray(params.petId) ? params.petId[0] : params.petId;
  const drugName = Array.isArray(params.drugName)
    ? params.drugName[0]
    : params.drugName;

  const { data: providers = [], isLoading } = useDiscoverProviders("pharmacy");
  const { data: orders = [] } = useRxFulfillmentOrders(petId ?? null);
  const request = useRequestFulfillment(petId);

  const [provider, setProvider] = useState(null);
  const [method, setMethod] = useState("delivery");
  const [location, setLocation] = useState(null); // { lat, lng, address }

  const myOrders = orders.filter(
    (o) => String(o.prescription_id) === String(prescriptionId),
  );

  const canSubmit =
    provider &&
    (method === "pickup" ||
      (method === "delivery" && location?.address?.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await request.mutateAsync({
        prescription_id: Number(prescriptionId),
        provider_id: provider.id,
        method,
        delivery_lat: method === "delivery" ? (location?.lat ?? null) : null,
        delivery_lng: method === "delivery" ? (location?.lng ?? null) : null,
        delivery_address:
          method === "delivery" ? (location?.address ?? null) : null,
      });
      Alert.alert(t("rxf.requestedTitle"), t("rxf.requestedBody"));
      setProvider(null);
      setLocation(null);
    } catch (e) {
      Alert.alert(t("rxf.couldNotRequest"), e.message || "");
    }
  };

  const pay = async (order) => {
    if (!order.price_cents) return;
    try {
      const res = await fetch(`/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: order.provider_id,
          kind: "product",
          amount_cents: order.price_cents,
          rail: "mercadopago",
          source_ref: `rxf-${order.id}`,
        }),
      });
      if (res.status === 503) {
        Alert.alert(t("rxf.payUnavailable"), t("rxf.payUnavailableBody"));
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Payment failed");
      // Link the order so the fulfillment tracks its payment.
      await fetch(`/api/rx-fulfillment-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: data.order?.id }),
      });
      if (data.checkoutUrl) Linking.openURL(data.checkoutUrl);
    } catch (e) {
      Alert.alert(t("rxf.couldNotPay"), e.message || "");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
            {t("rxf.title")}
          </Text>
          {drugName ? (
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
              {drugName}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Existing orders for this Rx */}
        {myOrders.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginBottom: 8 }}>
              {t("rxf.yourOrders")}
            </Text>
            {myOrders.map((o) => (
              <View
                key={o.id}
                testID={`rxf-order-${o.id}`}
                style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.peach }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>
                    {o.provider_name || t("rxf.pharmacy")}
                  </Text>
                  <Text style={{ fontWeight: "800", color: COLORS.coral }}>
                    {STATUS_LABEL[o.status] || o.status}
                  </Text>
                </View>
                <Text style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 2 }}>
                  {o.method === "pickup" ? t("rxf.pickup") : t("rxf.delivery")}
                  {o.price_cents != null ? ` · ${money(o.price_cents)}` : ""}
                </Text>
                {o.price_cents != null &&
                  o.order_status !== "paid" &&
                  o.status !== "cancelled" && (
                    <TouchableOpacity
                      testID={`rxf-pay-${o.id}`}
                      onPress={() => pay(o)}
                      style={{ marginTop: 10, backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 9, alignItems: "center" }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>
                        {t("rxf.pay")} {money(o.price_cents)}
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>
            ))}
          </View>
        )}

        {/* Request a new fulfillment */}
        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginBottom: 8 }}>
          {t("rxf.chooseProvider")}
        </Text>
        {isLoading ? (
          <ActivityIndicator color={COLORS.coral} />
        ) : providers.length === 0 ? (
          <Text testID="rxf-no-providers" style={{ color: COLORS.mutedBrown, fontSize: 13 }}>
            {t("rxf.noProviders")}
          </Text>
        ) : (
          <>
            {providers.map((p) => (
              <TouchableOpacity
                key={p.id}
                testID={`rxf-provider-${p.id}`}
                onPress={() => setProvider(p)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: provider?.id === p.id ? COLORS.peach : COLORS.card,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                }}
              >
                <Pill size={16} color={COLORS.coral} />
                <Text style={{ fontWeight: "700", color: COLORS.warmBrown }}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 12 }}>
              <MethodChip
                testID="rxf-method-delivery"
                Icon={Truck}
                label={t("rxf.delivery")}
                selected={method === "delivery"}
                onPress={() => setMethod("delivery")}
              />
              <MethodChip
                testID="rxf-method-pickup"
                Icon={Store}
                label={t("rxf.pickup")}
                selected={method === "pickup"}
                onPress={() => setMethod("pickup")}
              />
            </View>

            {method === "delivery" && (
              <View style={{ marginBottom: 12 }}>
                <LocationField
                  testID="rxf-location"
                  label={t("rxf.deliveryAddress")}
                  value={location}
                  onChange={setLocation}
                />
              </View>
            )}

            <TouchableOpacity
              testID="rxf-submit"
              onPress={submit}
              disabled={!canSubmit || request.isPending}
              style={{
                backgroundColor: canSubmit ? COLORS.coral : COLORS.peach,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                opacity: request.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                {t("rxf.request")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MethodChip({ Icon, label, selected, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: selected ? COLORS.coral : COLORS.card,
        borderRadius: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Icon size={16} color={selected ? "#fff" : COLORS.mutedBrown} />
      <Text style={{ fontWeight: "700", color: selected ? "#fff" : COLORS.warmBrown }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
