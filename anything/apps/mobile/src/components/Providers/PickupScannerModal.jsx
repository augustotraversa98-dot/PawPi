import React, { useEffect } from "react";
import { View, Text, Modal, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";

// Walker "Scan pickup" (ticket B3) — opens the camera to scan the owner's pickup QR. Emits the
// scanned string via onScanned; the caller redeems it (deduct a credit + start the walk). Handles
// camera-permission (asks on open) + a permission-denied state gracefully. `busy` freezes the
// scanner while a redeem is in flight so a single QR is only submitted once.
export default function PickupScannerModal({ visible, onClose, onScanned, busy = false, t }) {
  const [permission, requestPermission] = useCameraPermissions();
  const tr = (k, fb) => (t ? t(k, fb) : fb);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const granted = permission?.granted === true;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View
          style={{
            paddingTop: SPACING.xxl + SPACING.md,
            paddingHorizontal: SPACING.xl,
            paddingBottom: SPACING.md,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.md,
          }}
        >
          <PressableScale onPress={onClose} accessibilityLabel={tr("common.close", "Close")} testID="pickup-scanner-close">
            <X size={26} color="#FFF" />
          </PressableScale>
          <Text style={[TYPE.title2, { color: "#FFF" }]}>
            {tr("walkPickup.scanTitle", "Scan pickup code")}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          {!permission ? (
            <ActivityIndicator color="#FFF" />
          ) : !granted ? (
            <View style={{ padding: SPACING.xl, alignItems: "center" }}>
              <Text style={[TYPE.callout, { color: "#FFF", textAlign: "center", marginBottom: SPACING.lg }]}>
                {tr("walkPickup.cameraDenied", "Camera access is needed to scan the owner's pickup code.")}
              </Text>
              {permission.canAskAgain ? (
                <PressableScale
                  onPress={requestPermission}
                  testID="pickup-scanner-grant"
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.control,
                    paddingHorizontal: SPACING.xl,
                    paddingVertical: SPACING.sm + 2,
                  }}
                >
                  <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "800" }]}>
                    {tr("walkPickup.enableCamera", "Enable camera")}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          ) : (
            <>
              <CameraView
                testID="pickup-camera"
                style={{ width: "100%", height: "100%", position: "absolute" }}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={
                  busy
                    ? undefined
                    : ({ data }) => {
                        if (data) onScanned?.(data);
                      }
                }
              />
              <View
                style={{
                  width: 240,
                  height: 240,
                  borderRadius: RADIUS.card,
                  borderWidth: 3,
                  borderColor: "#FFFFFFCC",
                }}
              />
              {busy ? (
                <View style={{ position: "absolute", bottom: 80 }}>
                  <ActivityIndicator color="#FFF" size="large" />
                </View>
              ) : (
                <Text
                  style={[
                    TYPE.callout,
                    { color: "#FFF", position: "absolute", bottom: 80, textAlign: "center" },
                  ]}
                >
                  {tr("walkPickup.scanHint", "Point at the owner's QR code")}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
