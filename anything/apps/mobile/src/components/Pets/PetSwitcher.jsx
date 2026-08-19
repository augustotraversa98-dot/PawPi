import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { PetAvatar } from "./PetAvatar";
import { PetPickerSheet } from "./PetPickerSheet";
import { AddDogModal } from "./AddDogModal";

// Single entry point for switching/adding dogs. Owns the picker + add-dog modal
// state so it can be dropped anywhere. `pill` is the compact header element
// (Feed/Health); `row` is the "My Dogs" list item (More tab). Both open the
// same picker, which is the only selection mechanism (setCurrentPet).
export function PetSwitcher({ variant = "pill" }) {
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);

  // Close the picker before opening the form so the two modals never overlap.
  const openAdd = () => {
    setPickerVisible(false);
    setAddVisible(true);
  };

  const trigger =
    variant === "row" ? (
      <TouchableOpacity
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.9}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          backgroundColor: COLORS.card,
          borderRadius: 18,
          marginBottom: 10,
          shadowColor: COLORS.terracotta,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 2,
          borderWidth: 1,
          borderColor: COLORS.peach,
        }}
      >
        <PetAvatar uri={currentPet?.avatar_url} size={44} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: COLORS.warmBrown }}>
            {t("pets.myDogs")}
          </Text>
          <Text
            style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}
            numberOfLines={1}
          >
            {currentPet ? t("pets.activePrefix", { name: currentPet.name }) : t("pets.addYourFirstDog")}
          </Text>
        </View>
        <ChevronRight size={18} color={COLORS.peach} />
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.85}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          alignSelf: "flex-start",
          backgroundColor: COLORS.sand,
          borderRadius: 18,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderWidth: 1,
          borderColor: COLORS.peach,
        }}
      >
        <PetAvatar uri={currentPet?.avatar_url} size={28} />
        <Text
          style={{
            fontSize: 15,
            fontWeight: "800",
            color: COLORS.warmBrown,
            maxWidth: 160,
          }}
          numberOfLines={1}
        >
          {currentPet?.name || t("pets.addYourDog")}
        </Text>
        <ChevronDown size={16} color={COLORS.terracotta} />
      </TouchableOpacity>
    );

  return (
    <>
      {trigger}
      <PetPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAddDog={openAdd}
      />
      <AddDogModal visible={addVisible} onClose={() => setAddVisible(false)} />
    </>
  );
}
