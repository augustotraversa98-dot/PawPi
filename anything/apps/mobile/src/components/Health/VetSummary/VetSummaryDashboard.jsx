import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { FileText } from "lucide-react-native";
import VetSummaryModal from "./VetSummaryModal";

export default function VetSummaryDashboard() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: "#10B981",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <FileText color="#fff" size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#111",
                marginBottom: 4,
              }}
            >
              Vet Summary
            </Text>
            <Text style={{ fontSize: 14, color: "#6B7280" }}>
              Prepare for your vet visit
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text
          style={{
            fontSize: 14,
            color: "#4B5563",
            lineHeight: 20,
            marginBottom: 16,
          }}
        >
          Generate a clean summary from your recent logs to share with your
          veterinarian.
        </Text>

        {/* Quick Stats */}
        <View
          style={{
            backgroundColor: "#F0FDF4",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#BBF7D0",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: "#166534",
              marginBottom: 8,
            }}
          >
            Recent Activity (Last 7 Days)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#059669" }}>📊 24 logs</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#059669" }}>
                📸 8 photos
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#059669" }}>
                💊 2 medications
              </Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          style={{
            backgroundColor: "#10B981",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <FileText color="#fff" size={20} style={{ marginRight: 8 }} />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
            Create Vet Summary
          </Text>
        </TouchableOpacity>

        {/* Info */}
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
          }}
        >
          <Text style={{ fontSize: 12, color: "#6B7280", textAlign: "center" }}>
            Select a time range and customize what to include
          </Text>
        </View>
      </View>

      {/* Vet Summary Modal */}
      <VetSummaryModal
        visible={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
