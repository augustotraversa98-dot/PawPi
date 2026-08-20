import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { X, Check, Play, Edit3, Users, AlertCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLogWalk } from "@/hooks/useHealthTracking";
import WalkTrackingSettings from "./WalkTrackingSettings";
import { useTranslation } from "react-i18next";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function WalkActivityModal({
  visible,
  onClose,
  initialMode = "quickChoice",
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logWalkMutation = useLogWalk();

  const [step, setStep] = useState(initialMode);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");

  // Walk log state
  const [duration, setDuration] = useState(20);
  const [distance, setDistance] = useState(1.0);
  const [pace, setPace] = useState("normal");
  const [energyAfter, setEnergyAfter] = useState("normal");
  const [pottyPoo, setPottyPoo] = useState(0);
  const [pottyPee, setPottyPee] = useState(0);
  const [route, setRoute] = useState("");
  const [location, setLocation] = useState("");
  const [walkNotes, setWalkNotes] = useState("");

  const resetForm = () => {
    setStep("quickChoice");
    setShowConfirmation(false);
    setConfirmationMessage("");
    setDuration(20);
    setDistance(1.0);
    setPace("normal");
    setEnergyAfter("normal");
    setPottyPoo(0);
    setPottyPee(0);
    setRoute("");
    setLocation("");
    setWalkNotes("");
  };

  const handleStartWalk = () => {
    setConfirmationMessage(t("trackers.walk.startedMsg"));
    setShowConfirmation(true);
    setTimeout(() => {
      resetForm();
      onClose();
    }, 1500);
  };

  const handleWalkLogSubmit = async () => {
    try {
      await logWalkMutation.mutateAsync({
        duration,
        distance,
        pace,
        energyAfter,
        pottyEvents: {
          poo: pottyPoo,
          pee: pottyPee,
        },
        route,
        location,
        notes: walkNotes,
      });

      setConfirmationMessage(t("trackers.walk.loggedMsg"));
      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Walk log submit failed:", error);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
            {step === "walkLog" && t("trackers.walk.titleLog")}
            {step === "quickChoice" && t("trackers.walk.titleActivity")}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={18} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {/* Confirmation Screen */}
          {showConfirmation && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: C.sage + "20",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Check size={40} color={C.sage} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 8,
                }}
              >
                {confirmationMessage}
              </Text>
            </View>
          )}

          {/* Quick Choice Screen */}
          {!showConfirmation && step === "quickChoice" && (
            <View style={{ gap: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 4,
                }}
              >
                {t("trackers.walk.choosePrompt")}
              </Text>

              <TouchableOpacity
                onPress={handleStartWalk}
                style={{
                  backgroundColor: C.coral,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 14,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: "#FFF",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Play size={22} color={C.coral} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: "#FFF",
                      marginBottom: 4,
                    }}
                  >
                    {t("trackers.walk.startWalk")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#FFF",
                      opacity: 0.9,
                    }}
                  >
                    {t("trackers.walk.startWalkDesc")}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("walkLog")}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 14,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: C.sage + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Edit3 size={22} color={C.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    {t("trackers.walk.logManually")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: C.mutedBrown,
                    }}
                  >
                    {t("trackers.walk.logManuallyDesc")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Walk Log Form */}
          {!showConfirmation && step === "walkLog" && (
            <View style={{ gap: 20 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: -8,
                }}
              >
                {t("trackers.walk.details")}
              </Text>

              {/* Duration */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("trackers.walk.durationLabel")}
                </Text>
                <TextInput
                  value={duration.toString()}
                  onChangeText={(text) => setDuration(parseInt(text) || 0)}
                  keyboardType="numeric"
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                />
              </View>

              {/* Distance */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("trackers.walk.distanceLabel")}
                </Text>
                <TextInput
                  value={distance.toString()}
                  onChangeText={(text) => setDistance(parseFloat(text) || 0)}
                  keyboardType="decimal-pad"
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                />
              </View>

              {/* Pace */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.walk.pace")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["relaxed", "normal", "active"].map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPace(p)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: pace === p ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: pace === p ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: pace === p ? "700" : "600",
                          color: pace === p ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Energy after walk */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.walk.energyLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["low", "normal", "high"].map((e) => (
                    <TouchableOpacity
                      key={e}
                      onPress={() => setEnergyAfter(e)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: energyAfter === e ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: energyAfter === e ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: energyAfter === e ? "700" : "600",
                          color: energyAfter === e ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {e}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Potty events */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  {t("trackers.walk.pottyLabel")}
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      💩 Poo
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[0, 1, 2, 3].map((count) => (
                        <TouchableOpacity
                          key={count}
                          onPress={() => setPottyPoo(count)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              pottyPoo === count ? "#8D6E63" : C.sand,
                            borderWidth: 1.5,
                            borderColor:
                              pottyPoo === count ? "#8D6E63" : C.peach,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: pottyPoo === count ? "700" : "600",
                              color: pottyPoo === count ? "#FFF" : C.warmBrown,
                            }}
                          >
                            {count}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      💦 Pee
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[0, 1, 2, 3].map((count) => (
                        <TouchableOpacity
                          key={count}
                          onPress={() => setPottyPee(count)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              pottyPee === count ? "#42A5F5" : C.sand,
                            borderWidth: 1.5,
                            borderColor:
                              pottyPee === count ? "#42A5F5" : C.peach,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: pottyPee === count ? "700" : "600",
                              color: pottyPee === count ? "#FFF" : C.warmBrown,
                            }}
                          >
                            {count}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Route */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("trackers.walk.routeLabel")}
                </Text>
                <TextInput
                  value={route}
                  onChangeText={setRoute}
                  placeholder={t("trackers.walk.routePlaceholder")}
                  placeholderTextColor={C.mutedBrown + "80"}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                />
              </View>

              {/* Notes */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("trackers.walk.notesLabel")}
                </Text>
                <TextInput
                  value={walkNotes}
                  onChangeText={setWalkNotes}
                  placeholder={t("trackers.walk.notesPlaceholder")}
                  placeholderTextColor={C.mutedBrown + "80"}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />
              </View>

              {/* Tracking Settings */}
              <View
                style={{
                  marginTop: 8,
                  paddingTop: 20,
                  borderTopWidth: 1,
                  borderTopColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 16,
                  }}
                >
                  {t("trackers.walk.trackingSettings")}
                </Text>
                <WalkTrackingSettings />
              </View>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleWalkLogSubmit}
                disabled={logWalkMutation.isPending}
                style={{
                  backgroundColor: logWalkMutation.isPending
                    ? C.mutedBrown
                    : C.coral,
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  marginTop: 8,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {logWalkMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    {t("trackers.walk.submit")}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("quickChoice")}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  {t("trackers.walk.back")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
