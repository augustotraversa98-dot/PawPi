import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useCurrentPet } from "./useCurrentPet";

// Food logging
export function useLogFood() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (foodData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/food-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          mealType: foodData.mealType,
          foodName: foodData.foodName,
          amount: foodData.amount,
          appetite: foodData.appetite,
          finishedMeal: foodData.finishedMeal === "yes",
          waterIntake: foodData.waterIntake,
          vomitingOrReaction: foodData.vomiting || false,
          notes: foodData.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log food");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "food-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogFood] Food logged successfully");
    },
    onError: (error) => {
      console.error("[useLogFood] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Poo logging
export function useLogPoo() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (pooData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/poo-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          amount: pooData.amount,
          shape: pooData.shape,
          color: pooData.color,
          blood: pooData.blood || false,
          mucus: pooData.mucus || false,
          straining: pooData.effort === "strong" || pooData.effort === "mild",
          accidentInHouse: pooData.accident || false,
          photoUrl: pooData.photoUrl,
          notes: pooData.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log poo");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "poo-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogPoo] Poo logged successfully");
    },
    onError: (error) => {
      console.error("[useLogPoo] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Walk logging
export function useLogWalk() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (walkData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/walk-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          durationMinutes: walkData.duration,
          distance: walkData.distance,
          distanceUnit: "miles",
          pace: walkData.pace,
          energyAfter: walkData.energyAfter,
          pottyEvents: walkData.pottyEvents,
          routeOrLocation: walkData.route || walkData.location,
          notes: walkData.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log walk");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "walk-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogWalk] Walk logged successfully");
    },
    onError: (error) => {
      console.error("[useLogWalk] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// General check logging
export function useLogGeneralCheck() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (checkData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/general-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          eyesStatus: checkData.areas?.eyes?.status,
          earsStatus: checkData.areas?.ears?.status,
          teethStatus: checkData.areas?.teeth?.status,
          skinFurStatus: checkData.areas?.skin?.status,
          pawsStatus: checkData.areas?.paws?.status,
          faceStatus: checkData.areas?.face?.status,
          mood: checkData.areas?.mood?.status,
          energy: checkData.areas?.energy?.status,
          notes: checkData.notes || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log general check");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "general-checks"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogGeneralCheck] General check logged successfully");
    },
    onError: (error) => {
      console.error("[useLogGeneralCheck] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Photo check logging
export function useLogPhotoCheck() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (photoData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/photo-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          bodyArea: photoData.bodyArea,
          imageUrl: photoData.imageUrl,
          notes: photoData.notes || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log photo check");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "photo-checks"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogPhotoCheck] Photo check logged successfully");
    },
    onError: (error) => {
      console.error("[useLogPhotoCheck] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Pee logging
export function useLogPee() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (peeData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/pee-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          frequency: peeData.frequency,
          volume: peeData.volume,
          color: peeData.color,
          accidentInHouse: peeData.accidentInHouse || false,
          difficultyPeeing: peeData.difficultyPeeing || false,
          painOrCrying: peeData.painOrCrying || false,
          bloodVisible: peeData.bloodVisible || false,
          increasedThirst: peeData.increasedThirst || false,
          notes: peeData.notes || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log pee");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "pee-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogPee] Pee logged successfully");
    },
    onError: (error) => {
      console.error("[useLogPee] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Vomit logging
export function useLogVomit() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (vomitData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/vomit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          numberOfEpisodes: vomitData.numberOfEpisodes || 1,
          appearance: vomitData.appearance,
          relationToFood: vomitData.relationToFood,
          appetiteAfter: vomitData.appetiteAfter,
          energy: vomitData.energy,
          diarrheaPresent: vomitData.diarrheaPresent || false,
          photoUrl: vomitData.photoUrl || null,
          notes: vomitData.notes || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log vomit");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "vomit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogVomit] Vomit logged successfully");
    },
    onError: (error) => {
      console.error("[useLogVomit] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}

// Weight logging
export function useLogWeight() {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  return useMutation({
    mutationFn: async (weightData) => {
      if (!currentPet?.id) {
        throw new Error("No current pet selected");
      }

      const response = await fetch("/api/health/weight-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: currentPet.id,
          weight: weightData.weight,
          weightUnit: weightData.weightUnit || "lbs",
          bodyShapeEstimate: weightData.bodyShapeEstimate,
          photoUrl: weightData.photoUrl || null,
          notes: weightData.notes || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to log weight");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health", "weight-logs"] });
      queryClient.invalidateQueries({ queryKey: ["health", "timeline"] });
      console.log("[useLogWeight] Weight logged successfully");
    },
    onError: (error) => {
      console.error("[useLogWeight] Error:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    },
  });
}
