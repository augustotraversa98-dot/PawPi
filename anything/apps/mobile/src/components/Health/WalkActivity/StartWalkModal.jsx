import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { X, Pause, Play, StopCircle, Plus, Edit3 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  honey: "#FFB74D",
};

export default function StartWalkModal({
  visible,
  onClose,
  walk,
  petName,
  onWalkComplete,
  // ADDITIVE (ticket 2.102): optional node rendered at the top of the scroll, above the
  // countdown — the walker workspace passes its live route map here so the walker sees the
  // track being recorded alongside the timer. Owner self-tracking call-sites omit it → unchanged.
  topContent = null,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [walkNotes, setWalkNotes] = useState("");
  const [showExtendOptions, setShowExtendOptions] = useState(false);
  const startTimeRef = useRef(null);
  const intervalRef = useRef(null);

  const scheduledDurationMinutes = walk?.durationMinutes || 30;
  const scheduledDurationSeconds = scheduledDurationMinutes * 60;
  const walkName = walk?.name || t("trackers.walk.start.walkFallback");
  const petLabel = petName || t("common.yourPet");
  const pace = walk?.pace || "normal";

  useEffect(() => {
    if (visible && !startTimeRef.current) {
      startTimeRef.current = new Date();
      setElapsedSeconds(0);
      setIsPaused(false);
      setShowExtendOptions(false);
    }

    if (!visible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      startTimeRef.current = null;
      setElapsedSeconds(0);
      setIsPaused(false);
      setWalkNotes("");
      setShowExtendOptions(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [visible, isPaused]);

  // Check if countdown finished
  useEffect(() => {
    if (elapsedSeconds >= scheduledDurationSeconds && !showExtendOptions) {
      setShowExtendOptions(true);
      setIsPaused(true);
    }
  }, [elapsedSeconds, scheduledDurationSeconds, showExtendOptions]);

  const remainingSeconds = Math.max(
    0,
    scheduledDurationSeconds - elapsedSeconds,
  );

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleExtend = (minutes) => {
    setElapsedSeconds((prev) => prev - minutes * 60);
    setShowExtendOptions(false);
    setIsPaused(false);
  };

  const handleFinishWalk = () => {
    const actualDurationMinutes = Math.round(elapsedSeconds / 60);
    onWalkComplete({
      walk,
      startTime: startTimeRef.current,
      durationMinutes: actualDurationMinutes,
      pace,
      notes: walkNotes,
    });
  };

  const handleClose = () => {
    if (elapsedSeconds > 0) {
      Alert.alert(
        t("trackers.walk.start.walkInProgressTitle"),
        t("trackers.walk.start.walkInProgressBody"),
        [
          { text: t("trackers.walk.start.keepWalking"), style: "cancel" },
          {
            text: t("trackers.walk.start.cancelWalk"),
            style: "destructive",
            onPress: () => onClose(),
          },
        ],
      );
    } else {
      onClose();
    }
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
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              🚶 {walkName}
            </Text>
            <Text style={{ fontSize: 13, color: C.mutedBrown }}>{petLabel}</Text>
          </View>
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
          {topContent}

          {/* Countdown Display */}
          {!showExtendOptions && (
            <View style={{ alignItems: "center", marginBottom: 30 }}>
              <View
                style={{
                  width: 240,
                  height: 240,
                  borderRadius: 120,
                  backgroundColor: C.coral + "10",
                  borderWidth: 8,
                  borderColor: C.coral + "30",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 56,
                    fontWeight: "800",
                    color: C.coral,
                    marginBottom: 8,
                  }}
                >
                  {formatTime(remainingSeconds)}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.mutedBrown,
                  }}
                >
                  {remainingSeconds === 0 ? t("trackers.walk.start.timeUp") : t("trackers.walk.start.remaining")}
                </Text>
              </View>

              {/* Walk Info */}
              <View
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: C.peach,
                  width: "100%",
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    {t("trackers.walk.start.scheduledDuration")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {t("trackers.walk.start.scheduledMinutes", { count: scheduledDurationMinutes })}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    {t("trackers.walk.start.elapsedTime")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {t("trackers.walk.start.elapsedMinutes", { count: Math.floor(elapsedSeconds / 60) })}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    {t("trackers.walk.start.pace")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.warmBrown,
                      textTransform: "capitalize",
                    }}
                  >
                    {pace}
                  </Text>
                </View>
              </View>

              {/* Pause/Resume Button */}
              {!isPaused && (
                <TouchableOpacity
                  onPress={handlePause}
                  style={{
                    backgroundColor: C.sand,
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    marginBottom: 12,
                  }}
                >
                  <Pause size={18} color={C.mutedBrown} />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.mutedBrown,
                    }}
                  >
                    {t("trackers.walk.start.pause")}
                  </Text>
                </TouchableOpacity>
              )}

              {isPaused && !showExtendOptions && (
                <TouchableOpacity
                  onPress={handleResume}
                  style={{
                    backgroundColor: C.sage,
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Play size={18} color="#FFF" />
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}
                  >
                    {t("trackers.walk.start.resume")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Extend Options */}
          {showExtendOptions && (
            <View style={{ marginBottom: 30 }}>
              <View
                style={{
                  backgroundColor: C.honey + "15",
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 2,
                  borderColor: C.honey + "40",
                  marginBottom: 20,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 40, marginBottom: 12 }}>⏰</Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 6,
                  }}
                >
                  {t("trackers.walk.start.walkTimeUpTitle")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {t("trackers.walk.start.didFinish", { pet: petLabel })}
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 12,
                }}
              >
                {t("trackers.walk.start.extendWalk")}
              </Text>

              <View style={{ gap: 10, marginBottom: 20 }}>
                {[10, 15, 30].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    onPress={() => handleExtend(mins)}
                    style={{
                      backgroundColor: C.sage,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Plus size={18} color="#FFF" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#FFF",
                      }}
                    >
                      {t("trackers.walk.start.extendMin", { count: mins })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Edit3
                size={14}
                color={C.mutedBrown}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: C.warmBrown,
                }}
              >
                {t("trackers.walk.start.notesLabel")}
              </Text>
            </View>
            <TextInput
              value={walkNotes}
              onChangeText={setWalkNotes}
              placeholder={t("trackers.walk.start.notesPlaceholder")}
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
                textAlignVertical: "top",
                minHeight: 80,
              }}
            />
          </View>

          {/* Finish Walk Button */}
          <TouchableOpacity
            onPress={handleFinishWalk}
            style={{
              backgroundColor: C.coral,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              shadowColor: C.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <StopCircle size={20} color="#FFF" />
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>
              {t("trackers.walk.start.finishWalk")}
            </Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
