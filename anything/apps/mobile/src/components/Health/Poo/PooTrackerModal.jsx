import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  X,
  Check,
  Camera,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useLogPoo } from "@/hooks/useHealthTracking";
import { useUpload } from "@/utils/useUpload";
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

export default function PooTrackerModal({ visible, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logPooMutation = useLogPoo();
  const [upload, { loading: uploading }] = useUpload();

  const [step, setStep] = useState("quickChoice");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Form state
  const [amount, setAmount] = useState("medium");
  const [shape, setShape] = useState("normal");
  const [color, setColor] = useState("brown");
  const [blood, setBlood] = useState(false);
  const [mucus, setMucus] = useState(false);
  const [effort, setEffort] = useState("none");
  const [accident, setAccident] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [localPhotoUri, setLocalPhotoUri] = useState(null);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setStep("quickChoice");
    setShowConfirmation(false);
    setShowWarning(false);
    setAmount("medium");
    setShape("normal");
    setColor("brown");
    setBlood(false);
    setMucus(false);
    setEffort("none");
    setAccident(false);
    setPhotoUrl(null);
    setLocalPhotoUri(null);
    setNotes("");
  };

  const logHasConcerns = (logData) => {
    return (
      logData.blood ||
      logData.color === "black" ||
      logData.color === "red" ||
      (logData.shape === "liquid" && logData.mucus) ||
      logData.effort === "strong"
    );
  };

  const handleQuickLog = async () => {
    try {
      await logPooMutation.mutateAsync({
        amount: "medium",
        shape: "normal",
        color: "brown",
        blood: false,
        mucus: false,
        effort: "none",
        accident: false,
        notes: "",
      });

      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Quick log failed:", error);
    }
  };

  const handleDetailedSubmit = async () => {
    try {
      // Upload photo first if there is one. Photo is optional — if the upload
      // fails we still save the log without it.
      let uploadedPhotoUrl = null;
      if (localPhotoUri) {
        const uploadResult = await upload({
          reactNativeAsset: {
            uri: localPhotoUri,
            name: `poo_${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });
        if (uploadResult.error) {
          alert(t("trackers.poo.photoUploadFailed"));
        } else {
          uploadedPhotoUrl = uploadResult.url;
        }
      }

      const newLog = {
        amount,
        shape,
        color,
        blood,
        mucus,
        effort,
        accident,
        photoUrl: uploadedPhotoUrl,
        notes,
      };

      const hasConcerns = logHasConcerns(newLog);

      await logPooMutation.mutateAsync(newLog);

      if (hasConcerns) {
        setShowWarning(true);
      } else {
        setShowConfirmation(true);
        setTimeout(() => {
          resetForm();
          onClose();
        }, 1500);
      }
    } catch (error) {
      console.error("Detailed submit failed:", error);
    }
  };

  const handleWarningAcknowledge = () => {
    setShowConfirmation(true);
    setShowWarning(false);
    setTimeout(() => {
      resetForm();
      onClose();
    }, 1500);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert(t("trackers.poo.cameraPermRequired"));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setLocalPhotoUri(result.assets[0].uri);
    }
  };

  const handleChoosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert(t("trackers.poo.libraryPermRequired"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setLocalPhotoUri(result.assets[0].uri);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isBusy = logPooMutation.isPending || uploading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
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
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              {t("trackers.poo.title")}
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

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
                  {t("trackers.poo.logged")}
                </Text>
              </View>
            )}

            {/* Warning Screen */}
            {showWarning && (
              <View style={{ paddingVertical: 40 }}>
                <View
                  style={{
                    alignItems: "center",
                    marginBottom: 24,
                  }}
                >
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: "#FFB74D20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <AlertCircle size={40} color="#FFB74D" />
                  </View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.poo.worthNoting")}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: "#FFF4E6",
                    borderRadius: 18,
                    padding: 20,
                    borderWidth: 1.5,
                    borderColor: "#FFE4C4",
                    marginBottom: 24,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: C.warmBrown,
                      lineHeight: 21,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.poo.warningBody")}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleWarningAcknowledge}
                  style={{
                    backgroundColor: C.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    {t("trackers.poo.gotItThanks")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Quick Choice */}
            {!showConfirmation && !showWarning && step === "quickChoice" && (
              <View style={{ gap: 16 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 4,
                  }}
                >
                  {t("trackers.poo.quickPrompt")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    marginBottom: 12,
                  }}
                >
                  {t("trackers.poo.quickHint")}
                </Text>

                <TouchableOpacity
                  onPress={handleQuickLog}
                  disabled={isBusy}
                  style={{
                    backgroundColor: isBusy ? C.mutedBrown : C.sage,
                    borderRadius: 18,
                    padding: 20,
                    alignItems: "center",
                    shadowColor: C.sage,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "800",
                          color: "#FFF",
                          marginBottom: 6,
                        }}
                      >
                        {t("trackers.poo.sameAsUsual")}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#FFF",
                          opacity: 0.9,
                          textAlign: "center",
                        }}
                      >
                        {t("trackers.poo.sameAsUsualDesc")}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("detailedForm")}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 18,
                    padding: 20,
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {t("trackers.poo.somethingChanged")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: C.mutedBrown,
                      textAlign: "center",
                    }}
                  >
                    {t("trackers.poo.somethingChangedDesc")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Detailed Form */}
            {!showConfirmation && !showWarning && step === "detailedForm" && (
              <View style={{ gap: 20 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: -8,
                  }}
                >
                  {t("trackers.poo.details")}
                </Text>

                {/* Amount */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.amount")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["small", "medium", "large"].map((size) => (
                      <TouchableOpacity
                        key={size}
                        onPress={() => setAmount(size)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: amount === size ? C.sage : C.sand,
                          borderWidth: 1.5,
                          borderColor: amount === size ? C.sage : C.peach,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: amount === size ? "700" : "600",
                            color: amount === size ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {size}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Shape/Consistency */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.shapeLabel")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {["hard", "normal", "soft", "liquid"].map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setShape(s)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          backgroundColor: shape === s ? C.sage : C.sand,
                          borderWidth: 1.5,
                          borderColor: shape === s ? C.sage : C.peach,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: shape === s ? "700" : "600",
                            color: shape === s ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Color */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.colorLabel")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {["brown", "yellow", "green", "black", "red", "other"].map(
                      (c) => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setColor(c)}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 12,
                            backgroundColor: color === c ? C.sage : C.sand,
                            borderWidth: 1.5,
                            borderColor: color === c ? C.sage : C.peach,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: color === c ? "700" : "600",
                              color: color === c ? "#FFF" : C.warmBrown,
                              textTransform: "capitalize",
                            }}
                          >
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                </View>

                {/* Blood */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.bloodLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setBlood(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !blood ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !blood ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !blood ? "700" : "600",
                          color: !blood ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setBlood(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: blood ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: blood ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: blood ? "700" : "600",
                          color: blood ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Mucus */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.mucusLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setMucus(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !mucus ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !mucus ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !mucus ? "700" : "600",
                          color: !mucus ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setMucus(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: mucus ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: mucus ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: mucus ? "700" : "600",
                          color: mucus ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Effort/Straining */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.effortLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["none", "mild", "strong"].map((e) => (
                      <TouchableOpacity
                        key={e}
                        onPress={() => setEffort(e)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: effort === e ? C.sage : C.sand,
                          borderWidth: 1.5,
                          borderColor: effort === e ? C.sage : C.peach,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: effort === e ? "700" : "600",
                            color: effort === e ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {e}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Accident in house */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 10,
                    }}
                  >
                    {t("trackers.poo.accidentLabel")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setAccident(false)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: !accident ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: !accident ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: !accident ? "700" : "600",
                          color: !accident ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.noLabel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAccident(true)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: accident ? C.coral : C.sand,
                        borderWidth: 1.5,
                        borderColor: accident ? C.coral : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: accident ? "700" : "600",
                          color: accident ? "#FFF" : C.warmBrown,
                        }}
                      >
                        {t("trackers.shared.yesLabel")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Photo Upload */}
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 8,
                    }}
                  >
                    {t("trackers.poo.photoLabel")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 12,
                    }}
                  >
                    {t("trackers.poo.photoHint")}
                  </Text>

                  {localPhotoUri ? (
                    <View style={{ position: "relative" }}>
                      <Image
                        source={{ uri: localPhotoUri }}
                        style={{
                          width: "100%",
                          height: 200,
                          borderRadius: 16,
                          backgroundColor: C.sand,
                        }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => setLocalPhotoUri(null)}
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: C.coral,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <X size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        onPress={handleTakePhoto}
                        style={{
                          flex: 1,
                          backgroundColor: C.card,
                          borderRadius: 14,
                          paddingVertical: 16,
                          alignItems: "center",
                          gap: 8,
                          borderWidth: 1.5,
                          borderColor: C.peach,
                        }}
                      >
                        <Camera size={24} color={C.terracotta} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.warmBrown,
                          }}
                        >
                          {t("trackers.poo.takePhoto")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleChoosePhoto}
                        style={{
                          flex: 1,
                          backgroundColor: C.card,
                          borderRadius: 14,
                          paddingVertical: 16,
                          alignItems: "center",
                          gap: 8,
                          borderWidth: 1.5,
                          borderColor: C.peach,
                        }}
                      >
                        <ImageIcon size={24} color={C.terracotta} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: C.warmBrown,
                          }}
                        >
                          {t("trackers.poo.choosePhoto")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
                    {t("trackers.poo.notesLabel")}
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t("trackers.anythingDifferentPlaceholder")}
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

                {/* Submit */}
                <TouchableOpacity
                  onPress={handleDetailedSubmit}
                  disabled={isBusy}
                  style={{
                    backgroundColor: isBusy ? C.mutedBrown : C.coral,
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
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                    >
                      {t("trackers.poo.submit")}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("quickChoice")}
                  style={{ alignItems: "center", paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                    {t("trackers.poo.back")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
