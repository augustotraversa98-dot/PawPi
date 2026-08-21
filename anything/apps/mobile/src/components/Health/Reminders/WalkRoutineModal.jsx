import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { X, Plus, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { ROUTINE_TYPES } from "@/data/routinesData";
import { DEFAULT_WALK, DEFAULT_WALKS } from "@/constants/walkRoutineDefaults";
import { useWalkRoutineState } from "@/hooks/useWalkRoutineState";
import WalkCountSelector from "./WalkCountSelector";
import WalkItem from "./WalkItem";

export default function WalkRoutineModal({
  visible,
  onClose,
  onSave,
  onDelete,
  editingRoutine,
  petName = "your pet",
}) {
  const { t } = useTranslation();
  const {
    step,
    setStep,
    walkCount,
    setWalkCount,
    walks,
    setWalks,
    expandedWalkIndex,
    setExpandedWalkIndex,
  } = useWalkRoutineState(editingRoutine, visible);

  const [isDeleting, setIsDeleting] = useState(false);
  const [debugStatus, setDebugStatus] = useState("");

  const handleCountSelect = (count) => {
    if (count === "custom") {
      setWalkCount(2);
      setWalks(DEFAULT_WALKS[2]);
    } else {
      setWalkCount(count);
      setWalks(DEFAULT_WALKS[count] || DEFAULT_WALKS[2]);
    }
    setStep("details");
  };

  const handleWalkChange = (index, field, value) => {
    const updated = [...walks];
    updated[index] = { ...updated[index], [field]: value };
    setWalks(updated);
  };

  const handleAddWalk = () => {
    setWalks([...walks, { ...DEFAULT_WALK, name: t("walkRoutine.walkName"), time: "15:00" }]);
    setWalkCount(walks.length + 1);
  };

  const handleRemoveWalk = (index) => {
    setDebugStatus(`Delete walk pressed (${walks.length} walks total)`);

    if (walks.length === 1) {
      // Last walk - show delete entire routine confirmation
      setDebugStatus("Last walk - will delete full routine");

      Alert.alert(
        t("walkRoutine.deleteLastTitle"),
        t("walkRoutine.deleteLastBody"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
            onPress: () => {
              setDebugStatus("");
            },
          },
          {
            text: t("walkRoutine.deleteRoutine"),
            style: "destructive",
            onPress: () => confirmDeleteFullRoutine(),
          },
        ],
      );
    } else {
      // Multiple walks - show delete walk confirmation
      setDebugStatus("Opening delete walk confirmation");

      Alert.alert(
        t("walkRoutine.deleteWalkTitle"),
        t("walkRoutine.deleteWalkBody"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
            onPress: () => {
              setDebugStatus("");
            },
          },
          {
            text: t("walkRoutine.deleteWalk"),
            style: "destructive",
            onPress: () => confirmDeleteWalk(index),
          },
        ],
      );
    }
  };

  const confirmDeleteWalk = async (deleteWalkIndex) => {
    if (deleteWalkIndex === null || deleteWalkIndex === undefined) {
      Alert.alert(t("common.error"), t("walkRoutine.couldNotIdentify"));
      return;
    }

    setDebugStatus("Deleting walk...");
    setIsDeleting(true);

    try {
      // Remove walk from local array
      const updatedWalks = walks.filter((_, i) => i !== deleteWalkIndex);

      // If editing existing routine, save to database immediately
      if (editingRoutine?.id) {
        setDebugStatus(`Saving to database (routine ${editingRoutine.id})`);

        const response = await fetch("/api/routines", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: parseInt(editingRoutine.id),
            walkSchedule: updatedWalks,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update routine: ${response.statusText}`);
        }

        const data = await response.json();
        setDebugStatus("Walk deleted successfully ✓");
      }

      // Update local state
      setWalks(updatedWalks);
      setWalkCount(updatedWalks.length);
      if (expandedWalkIndex === deleteWalkIndex) {
        setExpandedWalkIndex(null);
      } else if (expandedWalkIndex > deleteWalkIndex) {
        setExpandedWalkIndex(expandedWalkIndex - 1);
      }
      setIsDeleting(false);

      Alert.alert(t("walkRoutine.walkDeleted"));

      // Clear debug status after 2 seconds
      setTimeout(() => setDebugStatus(""), 2000);
    } catch (error) {
      setDebugStatus(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      Alert.alert(t("common.error"), t("walkRoutine.couldNotDelete"));

      // Clear error debug status after 3 seconds
      setTimeout(() => setDebugStatus(""), 3000);
    }
  };

  const confirmDeleteFullRoutine = async () => {
    if (!editingRoutine?.id) {
      setDebugStatus("Error: No routine ID");
      Alert.alert(t("common.error"), t("walkRoutine.couldNotDeleteRoutine"));
      return;
    }

    setDebugStatus(`Deleting routine ${editingRoutine.id}...`);
    setIsDeleting(true);

    try {
      // Single delete path: route through the parent's onDelete (the store's
      // soft-delete + future-reminder/early-ack clear + refetch). The parent
      // owns the "Routine deleted" toast, so we don't duplicate it here.
      if (onDelete) {
        await onDelete(editingRoutine.id);
      }
      setIsDeleting(false);
      setDebugStatus("");
      onClose();
    } catch (error) {
      setDebugStatus(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      Alert.alert(t("common.error"), t("walkRoutine.couldNotDelete"));

      // Clear error debug status after 3 seconds
      setTimeout(() => setDebugStatus(""), 3000);
    }
  };

  const handleDeleteRoutinePress = () => {
    setDebugStatus("Delete button pressed - opening confirmation");

    Alert.alert(
      t("walkRoutine.deleteRoutineTitle"),
      t("walkRoutine.deleteRoutineBody"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
          onPress: () => {
            setDebugStatus("");
          },
        },
        {
          text: t("walkRoutine.deleteRoutine"),
          style: "destructive",
          onPress: () => confirmDeleteFullRoutine(),
        },
      ],
    );
  };

  const toggleWalkExpanded = (index) => {
    setExpandedWalkIndex(expandedWalkIndex === index ? null : index);
  };

  const handleSave = () => {
    const routine = {
      type: ROUTINE_TYPES.WALK,
      petId: editingRoutine?.petId ?? null,
      isActive: true,
      walks,
      times: walks.map((w) => w.time),
      title: "Walks",
      description: `${walks.length} walk${walks.length > 1 ? "s" : ""} per day`,
    };

    if (editingRoutine) {
      routine.id = editingRoutine.id;
    }

    onSave(routine);
    onClose();
  };

  if (step === "count" && !editingRoutine) {
    return (
      <WalkCountSelector
        visible={visible}
        onClose={onClose}
        onSelectCount={handleCountSelect}
        petName={petName}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              paddingTop: 60,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 4,
                }}
              >
                🚶 {editingRoutine ? t("walkRoutine.edit") : t("walkRoutine.create")}
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                {t("walkRoutine.subtitle", { pet: petName })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={20} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              {t("walkRoutine.walks")}
            </Text>

            {walks.map((walk, index) => (
              <WalkItem
                key={index}
                walk={walk}
                index={index}
                isExpanded={expandedWalkIndex === index}
                totalWalks={walks.length}
                onToggleExpanded={() => toggleWalkExpanded(index)}
                onRemove={() => handleRemoveWalk(index)}
                onChange={(field, value) =>
                  handleWalkChange(index, field, value)
                }
              />
            ))}

            <TouchableOpacity
              onPress={handleAddWalk}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 32,
              }}
            >
              <Plus size={18} color={C.mutedBrown} />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: C.mutedBrown,
                }}
              >
                {t("walkRoutine.addAnother")}
              </Text>
            </TouchableOpacity>

            {/* Debug Status (Development Only) */}
            {debugStatus !== "" && (
              <View
                style={{
                  backgroundColor: "#FFF3CD",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#FFC107",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: "#856404",
                    fontWeight: "600",
                  }}
                >
                  🔧 Debug: {debugStatus}
                </Text>
              </View>
            )}

            {/* Delete Routine Section - Only show when editing */}
            {editingRoutine && (
              <View style={{ marginTop: 8, marginBottom: 24 }}>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: C.peach,
                    paddingTop: 24,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.mutedBrown,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("walkRoutine.removeRoutine")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 12,
                      lineHeight: 17,
                    }}
                  >
                    {t("walkRoutine.removeHint")}
                  </Text>
                  <TouchableOpacity
                    onPress={handleDeleteRoutinePress}
                    disabled={isDeleting}
                    style={{
                      backgroundColor: "#FFE4E1",
                      borderRadius: 14,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderWidth: 1.5,
                      borderColor: C.coral,
                    }}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={C.coral} />
                    ) : (
                      <>
                        <Trash2 size={18} color={C.coral} />
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: C.coral,
                          }}
                        >
                          {t("walkRoutine.deleteBtn")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor: C.cream,
            }}
          >
            <TouchableOpacity
              onPress={handleSave}
              disabled={isDeleting}
              style={{
                backgroundColor: isDeleting ? C.mutedBrown : C.sage,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                shadowColor: C.sage,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                {editingRoutine ? t("walkRoutine.saveChanges") : t("walkRoutine.createRoutine")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
