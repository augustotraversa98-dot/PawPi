import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import {
  Plus,
  Pill,
  Syringe,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle,
  Calendar,
  ChevronRight,
} from "lucide-react-native";
import {
  getUpcomingDoses,
  getMissedDoses,
  getVaccinesDueSoon,
  getOverdueVaccines,
  getPreventivesDueSoon,
  getOverduePreventives,
  getCurrentMedications,
  formatDate,
  getDaysUntil,
  markDoseTaken,
} from "@/data/medicationData";
import MedicationModal from "./MedicationModal";

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

export default function MedicationDashboard() {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTab, setModalTab] = useState("medications"); // medications, vaccines, preventives
  const [refreshKey, setRefreshKey] = useState(0);

  const upcomingDoses = getUpcomingDoses();
  const missedDoses = getMissedDoses();
  const vaccinesDue = getVaccinesDueSoon();
  const overdueVaccines = getOverdueVaccines();
  const preventivesDue = getPreventivesDueSoon();
  const overduePreventives = getOverduePreventives();
  const currentMeds = getCurrentMedications();

  const handleDoseTaken = (dose) => {
    markDoseTaken(dose.medicationId, dose.timestamp, true);
    setRefreshKey((k) => k + 1);
  };

  const handleOpenModal = (tab) => {
    setModalTab(tab);
    setModalVisible(true);
  };

  const nextDose = upcomingDoses.find((d) => !d.taken && !d.missed);
  const hasAlerts =
    missedDoses.length > 0 ||
    overdueVaccines.length > 0 ||
    overduePreventives.length > 0;

  return (
    <View>
      {/* Main Dashboard Card */}
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          padding: 20,
          borderWidth: 1.5,
          borderColor: C.peach,
          shadowColor: C.terracotta,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 2,
              }}
            >
              Medications & Care
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              Meds, vaccines, preventives
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleOpenModal("medications")}
            style={{
              backgroundColor: C.coral,
              borderRadius: 12,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Plus size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Alerts Banner */}
        {hasAlerts && (
          <View
            style={{
              backgroundColor: "#FFEBEE",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#FFCDD2",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: missedDoses.length > 0 ? 10 : 0,
              }}
            >
              <AlertCircle size={20} color="#E57373" />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#C62828",
                  flex: 1,
                }}
              >
                {missedDoses.length > 0 &&
                  `${missedDoses.length} missed dose${missedDoses.length > 1 ? "s" : ""}`}
                {missedDoses.length > 0 &&
                  (overdueVaccines.length > 0 ||
                    overduePreventives.length > 0) &&
                  " • "}
                {overdueVaccines.length > 0 &&
                  `${overdueVaccines.length} overdue vaccine${overdueVaccines.length > 1 ? "s" : ""}`}
                {overdueVaccines.length > 0 &&
                  overduePreventives.length > 0 &&
                  " • "}
                {overduePreventives.length > 0 &&
                  `${overduePreventives.length} overdue preventive${overduePreventives.length > 1 ? "s" : ""}`}
              </Text>
            </View>
          </View>
        )}

        {/* Next Dose Card */}
        {nextDose && (
          <View
            style={{
              backgroundColor: C.sage + "10",
              borderRadius: 14,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: C.sage + "30",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Clock size={18} color={C.sage} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: C.mutedBrown,
                  }}
                >
                  Next dose
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: C.sage,
                }}
              >
                {nextDose.time}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  {nextDose.medicationName}
                </Text>
                <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                  {nextDose.dose}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDoseTaken(nextDose)}
                style={{
                  backgroundColor: C.sage,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <CheckCircle size={16} color="#FFF" />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#FFF",
                  }}
                >
                  Mark taken
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Stats */}
        <View style={{ gap: 12 }}>
          {/* Current Medications */}
          <TouchableOpacity
            onPress={() => handleOpenModal("medications")}
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "#9575CD20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Pill size={20} color="#9575CD" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  Current medications
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {currentMeds.length} active
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={C.mutedBrown} />
          </TouchableOpacity>

          {/* Vaccines */}
          <TouchableOpacity
            onPress={() => handleOpenModal("vaccines")}
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "#4DB6AC20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Syringe size={20} color="#4DB6AC" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  Vaccines
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {vaccinesDue.length > 0
                    ? `${vaccinesDue.length} due soon`
                    : "All current"}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={C.mutedBrown} />
          </TouchableOpacity>

          {/* Preventive Care */}
          <TouchableOpacity
            onPress={() => handleOpenModal("preventives")}
            style={{
              backgroundColor: C.sand,
              borderRadius: 12,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "#FFB74D20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Shield size={20} color="#FFB74D" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  Preventive care
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {preventivesDue.length > 0
                    ? `${preventivesDue.length} due soon`
                    : "All current"}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={C.mutedBrown} />
          </TouchableOpacity>
        </View>

        {/* Empty State */}
        {currentMeds.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              No medications tracked yet
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 17,
              }}
            >
              Tap the + button to add medications, vaccines, or preventive care
            </Text>
          </View>
        )}
      </View>

      {/* Modal */}
      <MedicationModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setRefreshKey((k) => k + 1);
        }}
        initialTab={modalTab}
      />
    </View>
  );
}
