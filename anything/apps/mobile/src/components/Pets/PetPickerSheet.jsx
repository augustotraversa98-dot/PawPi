import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Plus } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { usePetProfile, useCurrentPet } from "@/hooks/usePetProfile";
import { PetAvatar } from "./PetAvatar";

// Bottom-sheet picker listing the current owner's real dogs (scoped server-side
// by owner_user_id = user_profiles.id). Marks the active dog, lets the user
// switch via setCurrentPet, and exposes an "Add a dog" action at the bottom.
export function PetPickerSheet({ visible, onClose, onAddDog }) {
  const insets = useSafeAreaInsets();
  const { data: pets, isLoading } = usePetProfile();
  const { data: currentPet, setCurrentPet } = useCurrentPet();

  const handleSelect = (petId) => {
    setCurrentPet(petId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Dim backdrop */}
        <TouchableOpacity
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59,36,27,0.45)",
          }}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            maxHeight: "80%",
            paddingBottom: insets.bottom + 8,
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 2 }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.peach,
              }}
            />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              textAlign: "center",
              paddingVertical: 12,
            }}
          >
            My Dogs
          </Text>

          <ScrollView
            style={{ paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <ActivityIndicator
                color={COLORS.coral}
                style={{ marginVertical: 24 }}
              />
            ) : (
              (pets || []).map((pet) => {
                const active = pet.id === currentPet?.id;
                return (
                  <TouchableOpacity
                    key={pet.id}
                    onPress={() => handleSelect(pet.id)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 16,
                      marginBottom: 10,
                      backgroundColor: COLORS.card,
                      borderWidth: 1.5,
                      borderColor: active ? COLORS.coral : COLORS.peach,
                    }}
                  >
                    <PetAvatar uri={pet.avatar_url} size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "800",
                          color: COLORS.warmBrown,
                        }}
                      >
                        {pet.name}
                      </Text>
                      {pet.breed ? (
                        <Text
                          style={{
                            fontSize: 13,
                            color: COLORS.mutedBrown,
                            marginTop: 2,
                          }}
                        >
                          {pet.breed}
                        </Text>
                      ) : null}
                    </View>
                    {active && <Check size={20} color={COLORS.coral} />}
                  </TouchableOpacity>
                );
              })
            )}

            {/* Add a dog */}
            <TouchableOpacity
              onPress={onAddDog}
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 14,
                borderRadius: 16,
                marginTop: 4,
                backgroundColor: COLORS.sand,
                borderWidth: 1.5,
                borderColor: COLORS.peach,
                borderStyle: "dashed",
              }}
            >
              <Plus size={18} color={COLORS.coral} />
              <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.coral }}>
                Add a dog
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
