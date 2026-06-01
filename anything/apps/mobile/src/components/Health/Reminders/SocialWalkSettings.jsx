import React from "react";
import { View, Text, TouchableOpacity, TextInput, Switch } from "react-native";
import { Users, MapPin, ShieldCheck } from "lucide-react-native";

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

export default function SocialWalkSettings({ walk, onChange }) {
  if (!walk.socialWalkEnabled) {
    return null;
  }

  return (
    <View
      style={{
        backgroundColor: C.sand,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Users size={16} color={C.sage} style={{ marginRight: 6 }} />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: C.warmBrown,
          }}
        >
          Social Walk Settings
        </Text>
      </View>

      {/* Visibility */}
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: C.mutedBrown,
          marginBottom: 6,
        }}
      >
        Visibility
      </Text>
      <View style={{ gap: 6, marginBottom: 12 }}>
        {[
          {
            value: "friends_only",
            label: "Friends only",
            description: "Only mutual pet friends can see this walk",
          },
          {
            value: "nearby_pets",
            label: "Nearby pets",
            description: "Discoverable by pets in your area",
          },
        ].map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange("visibility", option.value)}
            style={{
              backgroundColor:
                walk.visibility === option.value ? C.sage + "15" : "#fff",
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: walk.visibility === option.value ? C.sage : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: walk.visibility === option.value ? "700" : "600",
                color: walk.visibility === option.value ? C.sage : C.warmBrown,
                marginBottom: 4,
              }}
            >
              {option.label}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: C.mutedBrown,
              }}
            >
              {option.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Max Pets */}
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: C.mutedBrown,
          marginBottom: 6,
        }}
      >
        Max pets (including yours)
      </Text>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {[2, 3, 4, 5, 6].map((num) => (
          <TouchableOpacity
            key={num}
            onPress={() => onChange("maxPets", num)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: walk.maxPets === num ? C.sage : C.card,
              borderWidth: 1,
              borderColor: walk.maxPets === num ? C.sage : C.peach,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: walk.maxPets === num ? "700" : "600",
                color: walk.maxPets === num ? "#FFF" : C.warmBrown,
              }}
            >
              {num}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meeting Area */}
      <View style={{ marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <MapPin size={12} color={C.mutedBrown} style={{ marginRight: 4 }} />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: C.mutedBrown,
            }}
          >
            Meeting area (general)
          </Text>
        </View>
        <TextInput
          value={walk.meetingArea || ""}
          onChangeText={(text) => onChange("meetingArea", text)}
          placeholder="e.g., Central Park, Downtown area"
          placeholderTextColor={C.mutedBrown + "80"}
          style={{
            backgroundColor: C.card,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: C.warmBrown,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        />
        <Text
          style={{
            fontSize: 10,
            color: C.mutedBrown,
            marginTop: 4,
          }}
        >
          Approximate area shown publicly for privacy
        </Text>
      </View>

      {/* Meeting Location Details */}
      <View style={{ marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <ShieldCheck
            size={12}
            color={C.mutedBrown}
            style={{ marginRight: 4 }}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: C.mutedBrown,
            }}
          >
            Exact meeting location (private)
          </Text>
        </View>
        <TextInput
          value={walk.meetingLocationDetails || ""}
          onChangeText={(text) => onChange("meetingLocationDetails", text)}
          placeholder="e.g., Main entrance by the fountain"
          placeholderTextColor={C.mutedBrown + "80"}
          multiline
          numberOfLines={2}
          style={{
            backgroundColor: C.card,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: C.warmBrown,
            borderWidth: 1,
            borderColor: C.peach,
            textAlignVertical: "top",
            minHeight: 60,
          }}
        />
        <Text
          style={{
            fontSize: 10,
            color: C.mutedBrown,
            marginTop: 4,
          }}
        >
          Only shown to approved participants
        </Text>
      </View>

      {/* Approval Required */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: C.card,
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: C.warmBrown,
              marginBottom: 2,
            }}
          >
            Approval required
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: C.mutedBrown,
            }}
          >
            Review join requests before accepting
          </Text>
        </View>
        <Switch
          value={walk.approvalRequired ?? true}
          onValueChange={(val) => onChange("approvalRequired", val)}
          trackColor={{ false: C.peach, true: C.sage + "60" }}
          thumbColor={walk.approvalRequired ? C.sage : "#fff"}
        />
      </View>

      {/* Notes for Guests */}
      <View>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: C.mutedBrown,
            marginBottom: 6,
          }}
        >
          Notes for guests (optional)
        </Text>
        <TextInput
          value={walk.notesForGuests || ""}
          onChangeText={(text) => onChange("notesForGuests", text)}
          placeholder="e.g., Bring water, poop bags provided"
          placeholderTextColor={C.mutedBrown + "80"}
          multiline
          numberOfLines={2}
          style={{
            backgroundColor: C.card,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: C.warmBrown,
            borderWidth: 1,
            borderColor: C.peach,
            textAlignVertical: "top",
            minHeight: 60,
          }}
        />
      </View>
    </View>
  );
}
