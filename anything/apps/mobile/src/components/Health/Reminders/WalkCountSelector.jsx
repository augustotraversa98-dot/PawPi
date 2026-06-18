import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { X } from "lucide-react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";

export default function WalkCountSelector({
  visible,
  onClose,
  onSelectCount,
  petName = "your pet",
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
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
            paddingBottom: 40,
          }}
        >
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
                🚶 Walk Routine
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                How often does {petName} usually walk?
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

          <View style={{ padding: 20, gap: 12 }}>
            {[1, 2].map((count) => (
              <TouchableOpacity
                key={count}
                onPress={() => onSelectCount(count)}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  padding: 20,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.warmBrown,
                    textAlign: "center",
                  }}
                >
                  {count === 1 ? "Once per day" : "Twice per day"}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => onSelectCount("custom")}
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                padding: 20,
                borderWidth: 1.5,
                borderColor: C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.mutedBrown,
                  textAlign: "center",
                }}
              >
                Custom
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
