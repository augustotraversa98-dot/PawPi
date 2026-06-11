import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import useRoutinesStore from "@/store/routinesStore";
import { ROUTINE_TYPES } from "@/data/routinesData";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RoutineCard from "./RoutineCard";
import RoutineTypeSelector from "./RoutineTypeSelector";
import FeedingRoutineModal from "./FeedingRoutineModal";
import WalkRoutineModal from "./WalkRoutineModal";
import MedicationRoutineModal from "./MedicationRoutineModal";
import PhotoCheckRoutineModal from "./PhotoCheckRoutineModal";
import SimpleRoutineModal from "./SimpleRoutineModal";
import PreventiveCareRoutineModal from "./PreventiveCareRoutineModal";
import VaccineRoutineModal from "./VaccineRoutineModal";
import VetAppointmentRoutineModal from "./VetAppointmentRoutineModal";
import MedicalCareRoutineModal from "./MedicalCareRoutineModal";
import WellnessCheckRoutineModal from "./WellnessCheckRoutineModal";

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

export default function RoutinesTab({ editRoutineId } = {}) {
  const { data: currentPet, isLoading: petLoading } = useCurrentPet();
  const queryClient = useQueryClient();
  const {
    routines,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    toggleRoutineActive,
    loadRoutines,
    loading,
  } = useRoutinesStore();

  // After an edit / toggle clears this routine's `${id}::early` acks server-side,
  // refetch the dismissals query so Health → Today re-derives heads-up without
  // the stale keys (the cleared occurrences surface again in their early window).
  const invalidateDismissals = useCallback(() => {
    if (currentPet?.id != null) {
      queryClient.invalidateQueries({
        queryKey: ["reminder-dismissals", currentPet.id],
      });
    }
  }, [currentPet?.id, queryClient]);

  const [typeSelectorVisible, setTypeSelectorVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [loadedPetId, setLoadedPetId] = useState(null);
  // Tracks which deep-link editRoutineId we've already auto-opened, so the edit
  // modal opens once (not on every render) and re-opens if the param changes.
  const [handledEditRoutineId, setHandledEditRoutineId] = useState(null);

  // Load routines when pet is available
  useEffect(() => {
    if (currentPet?.id && currentPet.id !== loadedPetId) {
      console.log("[RoutinesTab] Loading routines for pet:", currentPet.id);
      loadRoutines(currentPet.id);
      setLoadedPetId(currentPet.id);
    }
  }, [currentPet?.id, loadedPetId, loadRoutines]);

  // Filter out empty and deleted routines
  const validRoutines = routines.filter((routine) => {
    // Filter deleted routines (should already be filtered by backend, but double-check)
    if (routine.deletedAt || routine.deleted_at) {
      console.log("[RoutinesTab] Filtering deleted routine:", routine.id);
      return false;
    }

    // Filter walk routines with no active walks
    if (routine.type === "walk") {
      const activeWalks = (routine.walks || []).filter(
        (w) => w.reminderEnabled !== false,
      );
      if (activeWalks.length === 0) {
        console.log("[RoutinesTab] Filtering empty walk routine:", routine.id);
        return false; // Don't show walk routines with no active walks
      }
    }

    // Filter feeding routines with no active meals
    if (routine.type === "feeding") {
      const activeMeals = (routine.meals || []).filter(
        (m) => m.reminderEnabled !== false,
      );
      if (activeMeals.length === 0) {
        console.log(
          "[RoutinesTab] Filtering empty feeding routine:",
          routine.id,
        );
        return false; // Don't show feeding routines with no active meals
      }
    }

    return true;
  });

  const handleEdit = (routine) => {
    setEditingRoutine(routine);

    // Map legacy types to new grouped types
    let displayType = routine.type;
    if (
      routine.type === ROUTINE_TYPES.MEDICATION ||
      routine.type === ROUTINE_TYPES.VACCINE ||
      routine.type === ROUTINE_TYPES.PREVENTIVE
    ) {
      displayType = ROUTINE_TYPES.MEDICAL_CARE;
    } else if (
      routine.type === ROUTINE_TYPES.GENERAL_CHECK ||
      routine.type === ROUTINE_TYPES.WEIGHT_CHECK
    ) {
      displayType = ROUTINE_TYPES.WELLNESS_CHECK;
    }

    setSelectedType(displayType);
  };

  // Deep-link auto-open (Health → Today heads-up "Edit"): once the routines are
  // loaded, open the matching routine's edit flow exactly once per param value.
  useEffect(() => {
    if (!editRoutineId || handledEditRoutineId === editRoutineId) return;
    const match = routines.find((r) => String(r.id) === String(editRoutineId));
    if (match) {
      handleEdit(match);
      setHandledEditRoutineId(editRoutineId);
    }
  }, [editRoutineId, handledEditRoutineId, routines]);

  const handleToggle = async (id) => {
    try {
      await toggleRoutineActive(id);
      invalidateDismissals();
    } catch (error) {
      console.error("[RoutinesTab] Error toggling routine:", error);
      Alert.alert("Could not update routine. Please try again.");
    }
  };

  const handleCreateRoutine = () => {
    setEditingRoutine(null);
    setTypeSelectorVisible(true);
  };

  // Pull-to-refresh: reload the active pet's routines from the server.
  const handleRefresh = useCallback(async () => {
    if (currentPet?.id != null) {
      await loadRoutines(currentPet.id);
    }
  }, [currentPet?.id, loadRoutines]);

  const handleSelectType = (type) => {
    setSelectedType(type);
  };

  const handleSaveRoutine = async (routine) => {
    try {
      // Ensure petId is set to current pet
      const routineToSave = {
        ...routine,
        petId: currentPet?.id || routine.petId,
      };

      if (editingRoutine) {
        await updateRoutine(routineToSave.id, routineToSave);
        invalidateDismissals();
        Alert.alert("Routine saved");
      } else {
        await addRoutine(routineToSave);
        Alert.alert("Routine created");
      }
      setSelectedType(null);
      setEditingRoutine(null);
    } catch (error) {
      console.error("[RoutinesTab] Error saving routine:", error);
      Alert.alert("Could not save routine. Please try again.");
    }
  };

  const handleDelete = async (routineId) => {
    console.log("[RoutinesTab] handleDelete called", { routineId });
    try {
      console.log("[RoutinesTab] Calling deleteRoutine from store");
      await deleteRoutine(routineId);
      console.log("[RoutinesTab] deleteRoutine completed, refetching...");

      // Refetch to ensure UI is updated
      if (currentPet?.id) {
        await loadRoutines(currentPet.id);
        console.log("[RoutinesTab] Routines refetched successfully");
      }
    } catch (error) {
      console.error("[RoutinesTab] Error deleting routine:", error);
      throw error;
    }
  };

  const closeAllModals = () => {
    setSelectedType(null);
    setEditingRoutine(null);
  };

  const hasAnyRoutines = validRoutines.length > 0;
  const petName = currentPet?.name || "Your pet";

  // Show loading spinner while loading routines
  if (
    petLoading ||
    (loading && validRoutines.length === 0 && routines.length === 0)
  ) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={C.coral} />
        <Text style={{ marginTop: 12, fontSize: 14, color: C.mutedBrown }}>
          Loading routines...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <RefreshableScrollView
        refetch={handleRefresh}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
      >
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 4,
            }}
          >
            {petName}'s Routines
          </Text>
          <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
            Set {petName}'s care schedule so Social Pet knows when to remind you
          </Text>
        </View>

        {/* Routine Cards */}
        {hasAnyRoutines ? (
          <View style={{ gap: 16 }}>
            {validRoutines.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                onEdit={handleEdit}
                onToggle={handleToggle}
              />
            ))}
          </View>
        ) : (
          /* Empty State */
          <View
            style={{
              backgroundColor: C.sand,
              borderRadius: 16,
              padding: 40,
              alignItems: "center",
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📅</Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 8,
              }}
            >
              No routines yet
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 20,
              }}
            >
              Set {petName}'s care schedule so Social Pet knows when to remind
              you
            </Text>
            <TouchableOpacity
              onPress={handleCreateRoutine}
              style={{
                backgroundColor: C.coral,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Plus size={18} color="#FFF" strokeWidth={3} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>
                Create First Routine
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info Box */}
        {hasAnyRoutines && (
          <View
            style={{
              marginTop: 20,
              backgroundColor: "#E0F2FE",
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: "#BAE6FD",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: "#0C4A6E",
                lineHeight: 19,
                textAlign: "center",
              }}
            >
              💡 Routines automatically generate reminders. Turn them on/off
              anytime without losing your schedule
            </Text>
          </View>
        )}
      </RefreshableScrollView>

      {/* Floating Add Button */}
      {hasAnyRoutines && (
        <TouchableOpacity
          onPress={handleCreateRoutine}
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            backgroundColor: C.coral,
            borderRadius: 28,
            width: 56,
            height: 56,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: C.coral,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Plus size={28} color="#FFF" strokeWidth={3} />
        </TouchableOpacity>
      )}

      {/* Routine Type Selector */}
      <RoutineTypeSelector
        visible={typeSelectorVisible}
        onClose={() => setTypeSelectorVisible(false)}
        onSelectType={handleSelectType}
      />

      {/* Routine Modals */}
      <FeedingRoutineModal
        visible={selectedType === ROUTINE_TYPES.FEEDING}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <WalkRoutineModal
        visible={selectedType === ROUTINE_TYPES.WALK}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        onDelete={handleDelete}
        editingRoutine={editingRoutine}
      />
      <PhotoCheckRoutineModal
        visible={selectedType === ROUTINE_TYPES.PHOTO_CHECK}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <MedicalCareRoutineModal
        visible={selectedType === ROUTINE_TYPES.MEDICAL_CARE}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <WellnessCheckRoutineModal
        visible={selectedType === ROUTINE_TYPES.WELLNESS_CHECK}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <VetAppointmentRoutineModal
        visible={selectedType === ROUTINE_TYPES.VET_APPOINTMENT}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />

      {/* Legacy modals - kept for backward compatibility */}
      <MedicationRoutineModal
        visible={selectedType === ROUTINE_TYPES.MEDICATION}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <SimpleRoutineModal
        visible={selectedType === ROUTINE_TYPES.GENERAL_CHECK}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
        routineType={ROUTINE_TYPES.GENERAL_CHECK}
      />
      <SimpleRoutineModal
        visible={selectedType === ROUTINE_TYPES.WEIGHT_CHECK}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
        routineType={ROUTINE_TYPES.WEIGHT_CHECK}
      />
      <PreventiveCareRoutineModal
        visible={selectedType === ROUTINE_TYPES.PREVENTIVE}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
      <VaccineRoutineModal
        visible={selectedType === ROUTINE_TYPES.VACCINE}
        onClose={closeAllModals}
        onSave={handleSaveRoutine}
        editingRoutine={editingRoutine}
      />
    </View>
  );
}
