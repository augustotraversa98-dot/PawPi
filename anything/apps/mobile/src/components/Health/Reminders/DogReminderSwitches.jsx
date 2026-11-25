import React from "react";
import { View, Text, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { usePetProfile, useCurrentPet } from "@/hooks/usePetProfile";
import { SharedPetBadge } from "@/components/Pets/SharedPetBadge";
import useReminderMuteStore from "@/store/reminderMuteStore";
import useRoutinesStore from "@/store/routinesStore";
import useRemindersStore from "@/store/remindersStore";
import { useAuthStore } from "@/utils/auth/store";

// "Remind me about this dog": one switch per dog (own and shared), stored on this phone for the signed-in person only.
// Lets a couple sharing one dog decide whose phone rings. Today's list is not affected.
export default function DogReminderSwitches() {
  const { t } = useTranslation();
  const { data: pets } = usePetProfile();
  const { data: currentPet } = useCurrentPet();
  const userId = useAuthStore((s) => s.auth?.user?.id);
  const userKey = userId != null ? String(userId) : "anon";
  const muted = useReminderMuteStore((s) => s.mutedByUser[userKey]);
  const setDogMuted = useReminderMuteStore((s) => s.setDogMuted);

  if (!pets?.length) return null;

  const toggle = async (pet, on) => {
    setDogMuted(userKey, pet.id, !on);
    // Switching back on: read the dog again, in case its reminders are not in memory.
    if (on) {
      await useRoutinesStore
        .getState()
        .loadRoutines(pet.id, pet.id === currentPet?.id ? { silent: true } : { background: true });
    }
    await useRemindersStore.getState().syncAlarms();
  };

  return (
    <View testID="dog-reminder-switches" style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: COLORS.mutedBrown,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {t("reminderSettings.dogsTitle")}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, lineHeight: 18, marginBottom: 12 }}>
        {t("reminderSettings.dogsHint")}
      </Text>
      {pets.map((pet) => {
        const on = !muted?.includes(String(pet.id));
        const label = t("reminderSettings.dogSwitch", { name: pet.name });
        return (
          <View
            key={pet.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: COLORS.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.peach,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.warmBrown }}>{label}</Text>
              <SharedPetBadge pet={pet} style={{ marginTop: 4 }} />
              {!on ? (
                <Text style={{ fontSize: 12, color: COLORS.mutedBrown, lineHeight: 18, marginTop: 4 }}>
                  {t("reminderSettings.dogOffHint")}
                </Text>
              ) : null}
            </View>
            <Switch
              testID={`dog-reminder-switch-${pet.id}`}
              accessibilityLabel={label}
              value={on}
              onValueChange={(value) => toggle(pet, value)}
              trackColor={{ false: COLORS.sand, true: COLORS.coral + "60" }}
              thumbColor={on ? COLORS.coral : COLORS.peach}
              ios_backgroundColor={COLORS.sand}
            />
          </View>
        );
      })}
    </View>
  );
}
