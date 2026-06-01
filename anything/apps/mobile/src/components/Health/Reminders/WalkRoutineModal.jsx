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
}) {
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
    setWalks([...walks, { ...DEFAULT_WALK, name: "Walk", time: "15:00" }]);
    setWalkCount(walks.length + 1);
  };

  const handleRemoveWalk = (index) => {
    setDebugStatus(`Delete walk pressed (${walks.length} walks total)`);

    if (walks.length === 1) {
      // Last walk - show delete entire routine confirmation
      setDebugStatus("Last walk - will delete full routine");

      Alert.alert(
        "Delete Walk Routine?",
        "This is the last scheduled walk. Deleting it will remove the Walk Routine and stop future walk reminders. Past completed walks will stay in your dog's history.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              setDebugStatus("");
            },
          },
          {
            text: "Delete routine",
            style: "destructive",
            onPress: () => confirmDeleteFullRoutine(),
          },
        ],
      );
    } else {
      // Multiple walks - show delete walk confirmation
      setDebugStatus("Opening delete walk confirmation");

      Alert.alert(
        "Delete this walk?",
        "This will remove future reminders for this scheduled walk. Past completed walks will stay in your dog's history.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              setDebugStatus("");
            },
          },
          {
            text: "Delete walk",
            style: "destructive",
            onPress: () => confirmDeleteWalk(index),
          },
        ],
      );
    }
  };

  const confirmDeleteWalk = async (deleteWalkIndex) => {
    if (deleteWalkIndex === null || deleteWalkIndex === undefined) {
      Alert.alert("Error", "Could not identify walk to delete");
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

      Alert.alert("Walk deleted");

      // Clear debug status after 2 seconds
      setTimeout(() => setDebugStatus(""), 2000);
    } catch (error) {
      setDebugStatus(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      Alert.alert("Error", "Could not delete. Please try again.");

      // Clear error debug status after 3 seconds
      setTimeout(() => setDebugStatus(""), 3000);
    }
  };

  const confirmDeleteFullRoutine = async () => {
    if (!editingRoutine?.id) {
      setDebugStatus("Error: No routine ID");
      Alert.alert("Error", "Could not delete routine. Please try again.");
      return;
    }

    setDebugStatus(`Deleting routine ${editingRoutine.id}...`);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/routines?id=${editingRoutine.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      setDebugStatus("Routine deleted ✓ - closing modal");

      // Call parent onDelete to trigger refetch
      if (onDelete) {
        try {
          await onDelete(editingRoutine.id);
        } catch (refetchError) {
          // Non-fatal, just log
        }
      }

      setIsDeleting(false);
      Alert.alert("Success", "Routine deleted", [
        {
          text: "OK",
          onPress: () => {
            setDebugStatus("");
            onClose();
          },
        },
      ]);
    } catch (error) {
      setDebugStatus(`Delete failed: ${error.message}`);
      setIsDeleting(false);
      Alert.alert("Error", "Could not delete. Please try again.");

      // Clear error debug status after 3 seconds
      setTimeout(() => setDebugStatus(""), 3000);
    }
  };

  const handleDeleteRoutinePress = () => {
    setDebugStatus("Delete button pressed - opening confirmation");

    Alert.alert(
      "Delete Walk Routine?",
      "This will remove all future walk reminders. Past completed walks will remain in your dog's history.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            setDebugStatus("");
          },
        },
        {
          text: "Delete routine",
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
      petId: "phoebe",
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
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
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
                🚶 {editingRoutine ? "Edit" : "Create"} Walk Routine
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                Set Phoebe's walk schedule
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
              Walks
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
                Add Another Walk
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
                    Remove routine
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 12,
                      lineHeight: 17,
                    }}
                  >
                    Deleting removes all future walk reminders, but past walk
                    history stays saved.
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
                          Delete Walk Routine
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
                {editingRoutine ? "Save Changes" : "Create Routine"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
