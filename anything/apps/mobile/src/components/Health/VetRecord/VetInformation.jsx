import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { healthColors } from "@/constants/healthColors";

export function VetInformation() {
  const { t } = useTranslation();
  return (
    <View>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: healthColors.warmBrown,
          marginBottom: 12,
        }}
      >
        {t("vetInformation.primaryVet")}
      </Text>
      <View
        style={{
          backgroundColor: healthColors.card,
          borderRadius: 18,
          padding: 18,
          borderWidth: 1.5,
          borderColor: healthColors.peach,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: healthColors.warmBrown,
            marginBottom: 8,
          }}
        >
          Happy Paws Veterinary Clinic
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: healthColors.mutedBrown,
            marginBottom: 4,
            lineHeight: 19,
          }}
        >
          Dr. Sarah Johnson
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: healthColors.mutedBrown,
            marginBottom: 4,
            lineHeight: 19,
          }}
        >
          📞 (555) 123-4567
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: healthColors.mutedBrown,
            lineHeight: 19,
          }}
        >
          📍 123 Main Street, Anytown, CA 12345
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 14,
            backgroundColor: healthColors.sage,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: "#FFF",
            }}
          >
            {t("vetInformation.scheduleAppointment")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
