import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal } from "react-native";
import { X } from "lucide-react-native";
import { ROUTINE_TYPES, ROUTINE_TYPE_CONFIG } from "@/data/routinesData";

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

export default function RoutineTypeSelector({
  visible,
  onClose,
  onSelectType,
}) {
  const routineTypes = [
    ROUTINE_TYPES.FEEDING,
    ROUTINE_TYPES.WALK,
    ROUTINE_TYPES.PHOTO_CHECK,
    ROUTINE_TYPES.MEDICAL_CARE,
    ROUTINE_TYPES.WELLNESS_CHECK,
    ROUTINE_TYPES.VET_APPOINTMENT,
  ];

  const handleSelect = (type) => {
    onSelectType(type);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "80%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
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
                Create Routine
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                Choose the type of care routine
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

          {/* Routine Type Options */}
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ gap: 12 }}>
              {routineTypes.map((type) => {
                const config = ROUTINE_TYPE_CONFIG[type];
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => handleSelect(type)}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: config.color + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 14,
                      }}
                    >
                      <Text style={{ fontSize: 26 }}>{config.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: C.warmBrown,
                          marginBottom: 2,
                        }}
                      >
                        {config.label}
                      </Text>
                      <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                        {config.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
