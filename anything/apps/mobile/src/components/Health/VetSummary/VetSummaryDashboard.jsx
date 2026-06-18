import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { FileText, AlertCircle } from "lucide-react-native";
import VetSummaryModal from "./VetSummaryModal";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useVetSummary } from "@/hooks/useVetSummary";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { detectHealthFlags } from "@/utils/healthInsights";

// Real Vet Summary entry card (ticket 2.50) — replaces the hardcoded stats. Shows the active
// pet's real 7-day log counts + how many things are "worth discussing", and opens the modal.
function minusDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export default function VetSummaryDashboard() {
  const [showModal, setShowModal] = useState(false);
  const { data: currentPet } = useCurrentPet();
  const today = getLocalPostDateString();
  const from = minusDays(today, 7);

  const { data: summary } = useVetSummary(currentPet?.id, from, today);
  const flags = useMemo(() => (summary ? detectHealthFlags(summary) : []), [summary]);

  const totalLogs = summary
    ? (summary.food?.count || 0) +
      (summary.poo?.count || 0) +
      (summary.pee?.count || 0) +
      (summary.vomit?.events?.length || 0) +
      (summary.walks?.count || 0) +
      (summary.wellness?.count || 0)
    : 0;
  const photos = summary?.photoChecks?.count || 0;
  const meds = (summary?.meds || []).length;

  return (
    <>
      <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <View
            style={{
              width: 48, height: 48, borderRadius: 24, backgroundColor: "#10B981",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}
          >
            <FileText color="#fff" size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 4 }}>
              Vet Summary
            </Text>
            <Text style={{ fontSize: 14, color: "#6B7280" }}>Prepare for your vet visit</Text>
          </View>
        </View>

        <Text style={{ fontSize: 14, color: "#4B5563", lineHeight: 20, marginBottom: 16 }}>
          A real summary of {currentPet?.name || "your pet"}'s recent logs to share with your veterinarian.
        </Text>

        {/* Real recent activity */}
        <View
          style={{
            backgroundColor: "#F0FDF4", borderRadius: 12, padding: 16, marginBottom: 16,
            borderWidth: 1, borderColor: "#BBF7D0",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#166534", marginBottom: 8 }}>
            Recent Activity (Last 7 Days)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Text testID="dash-logs" style={{ fontSize: 12, color: "#059669" }}>📊 {totalLogs} logs</Text>
            <Text style={{ fontSize: 12, color: "#059669" }}>📸 {photos} photos</Text>
            <Text style={{ fontSize: 12, color: "#059669" }}>💊 {meds} medications</Text>
          </View>
          {flags.length > 0 && (
            <View testID="dash-flags" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
              <AlertCircle size={14} color="#B8860B" />
              <Text style={{ fontSize: 12, color: "#B8860B", fontWeight: "700" }}>
                {flags.length} thing{flags.length > 1 ? "s" : ""} worth discussing with your vet
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          testID="open-vetsummary"
          onPress={() => setShowModal(true)}
          style={{
            backgroundColor: "#10B981", borderRadius: 12, paddingVertical: 14,
            alignItems: "center", flexDirection: "row", justifyContent: "center",
          }}
        >
          <FileText color="#fff" size={20} style={{ marginRight: 8 }} />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Create Vet Summary</Text>
        </TouchableOpacity>
      </View>

      <VetSummaryModal visible={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
