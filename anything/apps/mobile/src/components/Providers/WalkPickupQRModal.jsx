import React from "react";
import { View, Text, Modal, ActivityIndicator } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { X } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useWalkPickupToken } from "@/hooks/useProviders";

// Owner's "Show pickup QR" (ticket B3). Fetches a short-lived signed token for (pet, provider) and
// renders it as a QR the walker scans at handover. The token refreshes on its own (the hook polls
// under its ~5-min TTL); the walker's scan deducts one credit + starts the walk. Real data only:
// no token → a spinner / retry, never a fake QR.
export default function WalkPickupQRModal({
  visible,
  petId,
  providerId,
  remaining = 0,
  businessName,
  onClose,
  t,
}) {
  const { data, isLoading, isError, refetch } = useWalkPickupToken(petId, providerId, {
    enabled: visible,
  });
  const token = data?.token;
  const tr = (k, fb, opts) => (t ? t(k, opts) : fb);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: SPACING.xl,
        }}
      >
        <View
          style={{
            backgroundColor: COLORS.cream,
            borderRadius: RADIUS.card,
            padding: SPACING.xl,
            width: "100%",
            maxWidth: 360,
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginBottom: SPACING.lg }}>
            <Text style={[TYPE.title2, { color: COLORS.warmBrown, flex: 1 }]}>
              {tr("walkPickup.title", "Pickup code")}
            </Text>
            <PressableScale onPress={onClose} accessibilityLabel={tr("common.close", "Close")} testID="walk-pickup-qr-close">
              <X size={22} color={COLORS.mutedBrown} />
            </PressableScale>
          </View>

          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, textAlign: "center", marginBottom: SPACING.lg }]}>
            {tr("walkPickup.instructions", "Show this to your walker at pickup — scanning it starts the walk and uses one credit.")}
          </Text>

          <View
            style={{
              backgroundColor: "#FFF",
              padding: SPACING.lg,
              borderRadius: RADIUS.md,
              minHeight: 220,
              minWidth: 220,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.coral} />
            ) : isError || !token ? (
              <PressableScale onPress={() => refetch()} testID="walk-pickup-qr-retry">
                <Text style={[TYPE.callout, { color: COLORS.coral, fontWeight: "700" }]}>
                  {tr("common.retry", "Tap to retry")}
                </Text>
              </PressableScale>
            ) : (
              <QRCode value={token} size={200} testID="walk-pickup-qr" />
            )}
          </View>

          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: SPACING.lg }]}>
            {tr(
              "walkPickup.remaining",
              `${remaining} walks left with ${businessName ?? "this walker"}`,
              { count: remaining, business: businessName ?? "" },
            )}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
