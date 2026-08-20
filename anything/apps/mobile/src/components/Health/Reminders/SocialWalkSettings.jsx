import React from "react";
import { View, Text, TouchableOpacity, TextInput, Switch } from "react-native";
import { Users, MapPin, ShieldCheck } from "lucide-react-native";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
          {t("socialWalkSettings.title")}
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
        {t("socialWalkSettings.visibility")}
      </Text>
      <View style={{ gap: 6, marginBottom: 12 }}>
        {[
          {
            value: "friends_only",
            label: t("socialWalkSettings.friendsOnly"),
            description: t("socialWalkSettings.friendsOnlyDesc"),
          },
          {
            value: "nearby_pets",
            label: t("socialWalkSettings.nearbyPets"),
            description: t("socialWalkSettings.nearbyPetsDesc"),
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
        {t("socialWalkSettings.maxPets")}
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
            {t("socialWalkSettings.meetingArea")}
          </Text>
        </View>
        <TextInput
          value={walk.meetingArea || ""}
          onChangeText={(text) => onChange("meetingArea", text)}
          placeholder={t("socialWalkSettings.meetingAreaPlaceholder")}
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
          {t("socialWalkSettings.meetingAreaHelp")}
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
            {t("socialWalkSettings.meetingLocation")}
          </Text>
        </View>
        <TextInput
          value={walk.meetingLocationDetails || ""}
          onChangeText={(text) => onChange("meetingLocationDetails", text)}
          placeholder={t("socialWalkSettings.meetingLocationPlaceholder")}
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
          {t("socialWalkSettings.meetingLocationHelp")}
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
            {t("socialWalkSettings.approvalRequired")}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: C.mutedBrown,
            }}
          >
            {t("socialWalkSettings.approvalRequiredDesc")}
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
          {t("socialWalkSettings.notesForGuests")}
        </Text>
        <TextInput
          value={walk.notesForGuests || ""}
          onChangeText={(text) => onChange("notesForGuests", text)}
          placeholder={t("socialWalkSettings.notesPlaceholder")}
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
