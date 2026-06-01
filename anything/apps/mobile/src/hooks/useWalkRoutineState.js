import { useState, useEffect } from "react";
import { DEFAULT_WALKS } from "@/constants/walkRoutineDefaults";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

export function useWalkRoutineState(editingRoutine, visible) {
  const [step, setStep] = useState("count");
  const [walkCount, setWalkCount] = useState(2);
  const [walks, setWalks] = useState(DEFAULT_WALKS[2]);
  const [expandedWalkIndex, setExpandedWalkIndex] = useState(null);

  useEffect(() => {
    if (editingRoutine) {
      setStep("details");
      const transformedWalks = (editingRoutine.walks || DEFAULT_WALKS[2]).map(
        (walk) => ({
          name: walk.name || "Walk",
          time: walk.time || "12:00",
          frequency: walk.frequency || ROUTINE_FREQUENCY.DAILY,
          days: walk.days || [],
          durationMinutes: walk.durationMinutes || 30,
          pace: walk.pace || "normal",
          reminderEnabled: walk.reminderEnabled ?? true,
          timeSensitive: walk.timeSensitive ?? true,
          socialWalkEnabled: walk.socialWalkEnabled || false,
          visibility: walk.visibility || "friends",
          notes: walk.notes || "",
        }),
      );
      setWalks(transformedWalks);
      setWalkCount(transformedWalks.length);
    } else {
      setStep("count");
      setWalkCount(2);
      setWalks(DEFAULT_WALKS[2]);
    }
    setExpandedWalkIndex(null);
  }, [editingRoutine, visible]);

  return {
    step,
    setStep,
    walkCount,
    setWalkCount,
    walks,
    setWalks,
    expandedWalkIndex,
    setExpandedWalkIndex,
  };
}
