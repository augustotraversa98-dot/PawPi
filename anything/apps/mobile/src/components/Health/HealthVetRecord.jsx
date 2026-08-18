import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePetVaccinations } from "@/hooks/usePetVaccinations";
import { getDisplayAge } from "@/utils/petAge";
import { formatDisplayDate } from "@/utils/canonicalDateTime";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  FileText,
  Calendar,
  Stethoscope,
  Syringe,
  Pill,
  Plus,
  Share2,
  Camera,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Heart,
  Scissors,
  FlaskConical,
  Edit,
  User,
  ShieldCheck,
  X,
  CheckCircle,
  ClipboardList,
  Trash2,
} from "lucide-react-native";
import { AddDocumentModal } from "./VetRecord/AddDocumentModal";
import { AddVetNoteModal } from "./VetRecord/AddVetNoteModal";
import PhotoHistory from "./PhotoCheck/PhotoHistory";
import VetSummaryDashboard from "./VetSummary/VetSummaryDashboard";
import { PrescriptionsSection } from "./VetRecord/PrescriptionsSection";
import EditMedicalProfileModal from "./VetRecord/EditMedicalProfileModal";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

export default function HealthVetRecord() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  // Pull-to-refresh: invalidate every vet-record query for the active pet.
  // Expanded sections refetch immediately; collapsed ones (disabled queries)
  // are marked stale and refetch when next opened.
  const refetchVetRecord = useCallback(async () => {
    if (currentPet?.id == null) return;
    await Promise.all(
      [
        "vet-record-summary",
        "pet-medical-profile",
        "vet-record-allergies",
        "vet-record-conditions",
        "vet-record-surgeries",
        "vet-record-lab-results",
        "vet-record-documents",
        "vet-record-notes",
        "vet-appointments",
        "pet-vaccinations",
      ].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, currentPet.id] }),
      ),
    );
  }, [queryClient, currentPet?.id]);

  const [expandedSections, setExpandedSections] = useState({
    profile: true,
    allergies: false,
    conditions: false,
    medications: false,
    vaccines: false,
    visits: false,
    surgeries: false,
    labs: false,
    documents: false,
    photoHistory: false,
    vetNotes: false,
    upcoming: false,
    preparation: false,
  });

  const [showAddRecordPicker, setShowAddRecordPicker] = useState(false);
  const [showEditMedicalProfile, setShowEditMedicalProfile] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedVaccine, setSelectedVaccine] = useState(null);
  const [selectedSurgery, setSelectedSurgery] = useState(null);
  const [selectedLab, setSelectedLab] = useState(null);

  // Fetch summary counts
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["vet-record-summary", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return null;
      const response = await fetch(
        `/api/vet-record/summary?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch summary");
      return response.json();
    },
    enabled: !!currentPet?.id,
  });

  // Fetch medical profile
  const { data: medicalProfileData, refetch: refetchMedicalProfile } = useQuery(
    {
      queryKey: ["pet-medical-profile", currentPet?.id],
      queryFn: async () => {
        if (!currentPet?.id) return null;
        const response = await fetch(
          `/api/pet-medical-profiles?petId=${currentPet.id}`,
        );
        if (!response.ok) throw new Error("Failed to fetch medical profile");
        return response.json();
      },
      enabled: !!currentPet?.id,
    },
  );

  // Fetch allergies
  const { data: allergiesData } = useQuery({
    queryKey: ["vet-record-allergies", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { allergies: [] };
      const response = await fetch(
        `/api/vet-record/allergies?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch allergies");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.allergies,
  });

  // Fetch conditions
  const { data: conditionsData } = useQuery({
    queryKey: ["vet-record-conditions", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { conditions: [] };
      const response = await fetch(
        `/api/vet-record/conditions?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch conditions");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.conditions,
  });

  // Fetch surgeries
  const { data: surgeriesData } = useQuery({
    queryKey: ["vet-record-surgeries", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { surgeries: [] };
      const response = await fetch(
        `/api/vet-record/surgeries?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch surgeries");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.surgeries,
  });

  // Fetch lab results
  const { data: labResultsData } = useQuery({
    queryKey: ["vet-record-lab-results", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { labResults: [] };
      const response = await fetch(
        `/api/vet-record/lab-results?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch lab results");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.labs,
  });

  // Fetch documents
  const { data: documentsData } = useQuery({
    queryKey: ["vet-record-documents", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { documents: [] };
      const response = await fetch(
        `/api/vet-record/documents?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.documents,
  });

  // Owner document upload + management (ticket 2.41).
  const [addDocVisible, setAddDocVisible] = useState(false);
  const refetchDocuments = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["vet-record-documents", currentPet?.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["vet-record-summary", currentPet?.id],
    });
  }, [queryClient, currentPet?.id]);

  const openDocument = useCallback((doc) => {
    if (doc?.file_url) Linking.openURL(doc.file_url).catch(() => {});
  }, []);

  const deleteDocument = useCallback(
    (doc) => {
      Alert.alert("Delete document?", `Remove "${doc.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `/api/vet-record/documents?id=${doc.id}`,
                { method: "DELETE" },
              );
              if (!res.ok) throw new Error("Failed to delete");
              refetchDocuments();
            } catch (e) {
              Alert.alert("Error", "Could not delete the document.");
            }
          },
        },
      ]);
    },
    [refetchDocuments],
  );

  // Fetch vet notes
  const { data: vetNotesData } = useQuery({
    queryKey: ["vet-record-notes", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { notes: [] };
      const response = await fetch(
        `/api/vet-record/notes?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch notes");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.vetNotes,
  });

  // Append-only clinical history log (ticket 2.42): owner can add + delete; vets
  // append via their clinical route and can't edit/delete (RLS-enforced).
  const [addNoteVisible, setAddNoteVisible] = useState(false);
  const refetchVetNotes = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["vet-record-notes", currentPet?.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["vet-record-summary", currentPet?.id],
    });
  }, [queryClient, currentPet?.id]);

  const deleteVetNote = useCallback(
    (note) => {
      Alert.alert(
        "Delete entry?",
        "This permanently removes your history entry.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const res = await fetch(
                  `/api/vet-record/notes?id=${note.id}`,
                  { method: "DELETE" },
                );
                if (!res.ok) throw new Error("Failed");
                refetchVetNotes();
              } catch (e) {
                Alert.alert("Error", "Could not delete the entry.");
              }
            },
          },
        ],
      );
    },
    [refetchVetNotes],
  );

  const historyNotes = vetNotesData?.notes || [];

  // Fetch upcoming appointments
  const { data: upcomingAppointmentsData } = useQuery({
    queryKey: ["vet-appointments", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { appointments: [] };
      const response = await fetch(
        `/api/vet-appointments?petId=${currentPet.id}`,
      );
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
    enabled: !!currentPet?.id && expandedSections.upcoming,
  });

  // Fetch vaccinations — pet_vaccinations is the source of truth post-#87.
  // Owner-scoped; the list length drives the section's count badge.
  const {
    data: vaccinations = [],
    isLoading: vaccinationsLoading,
    error: vaccinationsError,
  } = usePetVaccinations(currentPet?.id);

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Open the owner's trust screen for the active pet: who has (or has requested)
  // access to this pet's record, where the owner approves / denies / revokes.
  // The screen derives the same active pet via useCurrentPet, so no params.
  const handleShare = () => {
    router.push("/(tabs)/more/data-access");
  };

  const handleAddRecord = () => {
    setShowAddRecordPicker(true);
  };

  // Open the Emergency Card (ticket 2.51) for the active pet — the printable tag QR,
  // the revocable vet link, and the shareable image card.
  const handleEmergencyCard = () => {
    if (currentPet?.id == null) return;
    router.push(`/emergency-card?petId=${currentPet.id}`);
  };

  const handleRecordTypeSelect = (record) => {
    setShowAddRecordPicker(false);
    const type = record?.type;
    // STRUCTURAL guard first: a coming-soon record type is display-only — honest
    // feedback, no add flow. Return before any real open so an unbuilt type can
    // never open a logging modal.
    if (record?.comingSoon) {
      Alert.alert(
        t("health.recordSoonTitle", { type }),
        t("health.recordSoonBody", { type }),
      );
      return;
    }
    // The two record types with a real add flow route straight to it (and expand
    // the section so the new entry is visible).
    if (type === "Vet Note") {
      setExpandedSections((prev) => ({ ...prev, vetNotes: true }));
      setAddNoteVisible(true);
      return;
    }
    if (type === "Document") {
      setExpandedSections((prev) => ({ ...prev, documents: true }));
      setAddDocVisible(true);
      return;
    }
    // Any unknown non-coming-soon type: honest feedback rather than a dead CTA.
    Alert.alert(
      t("health.recordSoonTitle", { type }),
      t("health.recordSoonBody", { type }),
    );
  };

  const SectionHeader = ({ title, icon: Icon, section, count }) => (
    <PressableScale
      onPress={() => toggleSection(section)}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: MATERIALS.surface,
          borderRadius: RADIUS.control,
          padding: SPACING.lg,
          marginBottom: expandedSections[section] ? SPACING.md : SPACING.lg,
          borderWidth: 1.5,
          borderColor: expandedSections[section] ? COLORS.coral : MATERIALS.hairline,
        },
        ELEVATION.sm,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: COLORS.coral + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={18} color={COLORS.coral} />
        </View>
        <View>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            {title}
          </Text>
          {count !== undefined && (
            <Text
              style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}
            >
              {count} {count === 1 ? "item" : "items"}
            </Text>
          )}
        </View>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={COLORS.mutedBrown} />
      ) : (
        <ChevronDown size={20} color={COLORS.mutedBrown} />
      )}
    </PressableScale>
  );

  const EmptyState = ({ icon: Icon, title, description }) => (
    <Card
      level="none"
      style={{
        padding: SPACING.xxl,
        marginBottom: SPACING.lg,
        borderWidth: 1.5,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: MATERIALS.surfaceSunken,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <Icon size={28} color={COLORS.mutedBrown} />
      </View>
      <Text
        style={[
          TYPE.headline,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, textAlign: "center" },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          TYPE.subhead,
          { color: COLORS.mutedBrown, textAlign: "center", lineHeight: 19 },
        ]}
      >
        {description}
      </Text>
    </Card>
  );

  if (summaryLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.sage} />
        <Text style={{ marginTop: 16, fontSize: 14, color: COLORS.mutedBrown }}>
          Loading vet record...
        </Text>
      </View>
    );
  }

  if (!currentPet) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
        }}
      >
        <Text
          style={{ fontSize: 16, color: COLORS.mutedBrown, textAlign: "center" }}
        >
          No pet selected
        </Text>
      </View>
    );
  }

  return (
    <RefreshableScrollView
      refetch={refetchVetRecord}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <View style={{ padding: 16 }}>
        {/* Header */}
        <View style={{ marginBottom: SPACING.xl }}>
          <Text
            style={[TYPE.title, { color: COLORS.warmBrown, marginBottom: SPACING.xs + 2 }]}
          >
            Vet Record
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
            Complete medical history for {currentPet.name}
          </Text>
        </View>

        {/* Quick Actions */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <PressableScale
            onPress={handleAddRecord}
            style={{
              flex: 1,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: 14,
              paddingHorizontal: SPACING.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
              shadowColor: COLORS.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Plus size={18} color="#FFF" />
            <Text style={[TYPE.callout, { fontWeight: "800", color: "#FFF" }]}>
              Add Record
            </Text>
          </PressableScale>
          <PressableScale
            onPress={handleShare}
            style={{
              flex: 1,
              backgroundColor: MATERIALS.surface,
              borderRadius: RADIUS.control,
              paddingVertical: 14,
              paddingHorizontal: SPACING.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
              borderWidth: 1.5,
              borderColor: MATERIALS.hairline,
            }}
          >
            <Share2 size={18} color={COLORS.terracotta} />
            <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}>
              Share
            </Text>
          </PressableScale>
        </View>

        {/* Emergency Card entry (ticket 2.51) */}
        <PressableScale
          testID="open-emergency-card"
          onPress={handleEmergencyCard}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.sm,
            marginBottom: SPACING.lg,
          }}
        >
          <Heart size={18} color="#FFFFFF" />
          <Text style={[TYPE.callout, { fontWeight: "800", color: "#FFFFFF" }]}>
            Emergency Card
          </Text>
        </PressableScale>

        {/* Access Control Message */}
        <View
          style={{
            backgroundColor: "#E3F2FD",
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
            borderWidth: 1.5,
            borderColor: "#BBDEFB",
            flexDirection: "row",
            gap: 12,
          }}
        >
          <ShieldCheck size={20} color="#1976D2" style={{ marginTop: 2 }} />
          <Text
            style={{
              fontSize: 13,
              color: "#0D47A1",
              lineHeight: 19,
              flex: 1,
              fontWeight: "600",
            }}
          >
            You control what information is shared with your veterinarian.
          </Text>
        </View>

        {/* Vet Summary Feature */}
        <VetSummaryDashboard />

        {/* Prescriptions (ticket 2.53) — owner read-only Rx a vet issued + request refill. */}
        <PrescriptionsSection petId={currentPet?.id} />

        {/* Pet Medical Profile */}
        <SectionHeader
          title="Pet Medical Profile"
          icon={User}
          section="profile"
        />
        {expandedSections.profile && (
          <View
            style={{
              backgroundColor: MATERIALS.surface,
              borderRadius: 16,
              padding: 18,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: MATERIALS.hairline,
            }}
          >
            {!medicalProfileData?.medicalProfile &&
            !medicalProfileData?.pet?.breed &&
            !medicalProfileData?.currentWeight?.weight ? (
              // Empty state
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: MATERIALS.surfaceSunken,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <User size={28} color={COLORS.mutedBrown} />
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: COLORS.warmBrown,
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  Medical profile not completed
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.mutedBrown,
                    textAlign: "center",
                    lineHeight: 19,
                    marginBottom: 20,
                  }}
                >
                  Add your dog's vet, microchip, emergency contact, and
                  insurance details.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEditMedicalProfile(true)}
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Plus size={18} color="#FFF" />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#FFF",
                    }}
                  >
                    Complete Profile
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Basic Information */}
                {(medicalProfileData?.pet?.breed ||
                  medicalProfileData?.pet?.age_years ||
                  medicalProfileData?.pet?.gender ||
                  medicalProfileData?.pet?.birthday ||
                  medicalProfileData?.currentWeight?.weight) && (
                  <View style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: COLORS.mutedBrown,
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Basic Information
                    </Text>
                    {[
                      { label: "Breed", value: medicalProfileData?.pet?.breed },
                      {
                        label: "Age",
                        value: getDisplayAge(medicalProfileData?.pet),
                      },
                      { label: "Sex", value: medicalProfileData?.pet?.gender },
                      {
                        label: "Birthday",
                        value: medicalProfileData?.pet?.birthday
                          ? formatDisplayDate(medicalProfileData.pet.birthday)
                          : null,
                      },
                      {
                        label: "Adoption Date",
                        value: medicalProfileData?.pet?.adoption_date
                          ? formatDisplayDate(medicalProfileData.pet.adoption_date)
                          : null,
                      },
                      {
                        label: "Current Weight",
                        value: medicalProfileData?.currentWeight?.weight
                          ? `${medicalProfileData.currentWeight.weight} ${medicalProfileData.currentWeight.weight_unit || "lbs"}`
                          : null,
                      },
                    ]
                      .filter((item) => item.value)
                      .map((item, idx) => (
                        <View
                          key={idx}
                          style={{
                            flexDirection: "row",
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: MATERIALS.surfaceSunken,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.mutedBrown,
                              fontWeight: "600",
                              width: 140,
                            }}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.warmBrown,
                              flex: 1,
                              fontWeight: "500",
                            }}
                          >
                            {item.value}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}

                {/* Medical Details */}
                {medicalProfileData?.medicalProfile && (
                  <View style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: COLORS.mutedBrown,
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Medical Details
                    </Text>
                    {[
                      {
                        label: "Spayed/Neutered",
                        value: medicalProfileData.medicalProfile
                          .spayed_neutered_status
                          ? `${medicalProfileData.medicalProfile.spayed_neutered_status}${
                              medicalProfileData.medicalProfile
                                .spayed_neutered_date
                                ? ` (${formatDisplayDate(medicalProfileData.medicalProfile.spayed_neutered_date)})`
                                : ""
                            }`
                          : null,
                      },
                      {
                        label: "Microchip ID",
                        value: medicalProfileData.medicalProfile.microchip_id,
                      },
                      {
                        label: "Primary Vet",
                        value:
                          medicalProfileData.medicalProfile.primary_vet_name,
                      },
                      {
                        label: "Primary Clinic",
                        value:
                          medicalProfileData.medicalProfile.primary_clinic_name,
                      },
                      {
                        label: "Vet Phone",
                        value: medicalProfileData.medicalProfile.vet_phone,
                      },
                      {
                        label: "Vet Email",
                        value: medicalProfileData.medicalProfile.vet_email,
                      },
                      {
                        label: "Emergency Contact",
                        value:
                          medicalProfileData.medicalProfile
                            .emergency_contact_name,
                      },
                      {
                        label: "Emergency Phone",
                        value:
                          medicalProfileData.medicalProfile
                            .emergency_contact_phone,
                      },
                      {
                        label: "Insurance",
                        value:
                          medicalProfileData.medicalProfile.insurance_provider,
                      },
                      {
                        label: "Policy Number",
                        value:
                          medicalProfileData.medicalProfile
                            .insurance_policy_number,
                      },
                    ]
                      .filter((item) => item.value)
                      .map((item, idx, arr) => (
                        <View
                          key={idx}
                          style={{
                            flexDirection: "row",
                            paddingVertical: 10,
                            borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                            borderBottomColor: MATERIALS.surfaceSunken,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.mutedBrown,
                              fontWeight: "600",
                              width: 140,
                            }}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.warmBrown,
                              flex: 1,
                              fontWeight: "500",
                            }}
                          >
                            {item.value}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}

                {/* Medical Notes */}
                {medicalProfileData?.medicalProfile?.medical_notes && (
                  <View style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: COLORS.mutedBrown,
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Medical Notes
                    </Text>
                    <View
                      style={{
                        backgroundColor: MATERIALS.surfaceSunken,
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: COLORS.warmBrown,
                          lineHeight: 19,
                        }}
                      >
                        {medicalProfileData.medicalProfile.medical_notes}
                      </Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => setShowEditMedicalProfile(true)}
                  style={{
                    backgroundColor: MATERIALS.surfaceSunken,
                    borderRadius: 12,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Edit size={16} color={COLORS.terracotta} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: COLORS.terracotta,
                    }}
                  >
                    Edit Medical Profile
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Upcoming Appointments */}
        <SectionHeader
          title="Upcoming Appointments"
          icon={Calendar}
          section="upcoming"
          count={summary?.upcomingAppointmentsCount || 0}
        />
        {expandedSections.upcoming && (
          <View style={{ marginBottom: 16 }}>
            {upcomingAppointmentsData?.appointments?.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No upcoming appointments"
                description="Schedule a vet visit so Social Pet can remind you."
              />
            ) : (
              upcomingAppointmentsData?.appointments?.map((appt) => (
                <View
                  key={appt.id}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.sage,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    {appt.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      marginBottom: 3,
                    }}
                  >
                    {formatDisplayDate(appt.appointment_date)} at{" "}
                    {appt.appointment_time}
                  </Text>
                  {appt.clinic && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      {appt.clinic}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Prepare for Next Visit */}
        <SectionHeader
          title="Prepare for Next Visit"
          icon={ClipboardList}
          section="preparation"
        />
        {expandedSections.preparation && (
          <EmptyState
            icon={ClipboardList}
            title="No visit preparation yet"
            description="Recent logs, questions, and photos will appear here before your next vet appointment."
          />
        )}

        {/* Allergies */}
        <SectionHeader
          title="Allergies"
          icon={AlertTriangle}
          section="allergies"
          count={summary?.allergiesCount || 0}
        />
        {expandedSections.allergies && (
          <View style={{ marginBottom: 16 }}>
            {allergiesData?.allergies?.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No allergies added"
                description="Add known food, environmental, or medication allergies."
              />
            ) : (
              allergiesData?.allergies?.map((allergy) => (
                <View
                  key={allergy.id}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: "#FFE0B2",
                    borderLeftWidth: 4,
                    borderLeftColor: "#FFB74D",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {allergy.allergen}
                  </Text>
                  {allergy.severity && (
                    <View
                      style={{
                        backgroundColor: "#FFE0B2",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        alignSelf: "flex-start",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: "#E65100",
                        }}
                      >
                        {allergy.severity} Severity
                      </Text>
                    </View>
                  )}
                  {allergy.reaction && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.mutedBrown,
                        marginBottom: 4,
                      }}
                    >
                      Reaction: {allergy.reaction}
                    </Text>
                  )}
                  {allergy.diagnosed_date && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      Diagnosed: {formatDisplayDate(allergy.diagnosed_date)}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Known Conditions */}
        <SectionHeader
          title="Known Conditions"
          icon={Heart}
          section="conditions"
          count={summary?.conditionsCount || 0}
        />
        {expandedSections.conditions && (
          <View style={{ marginBottom: 16 }}>
            {conditionsData?.conditions?.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No known conditions added"
                description="Track diagnosed or monitored health conditions here."
              />
            ) : (
              conditionsData?.conditions?.map((condition) => (
                <View
                  key={condition.id}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {condition.condition}
                  </Text>
                  {condition.status && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor:
                            condition.status.toLowerCase() === "active"
                              ? "#FFE0B2"
                              : COLORS.sage + "20",
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color:
                              condition.status.toLowerCase() === "active"
                                ? "#E65100"
                                : COLORS.sage,
                          }}
                        >
                          {condition.status}
                        </Text>
                      </View>
                      {condition.diagnosed_date && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: COLORS.mutedBrown,
                          }}
                        >
                          Diagnosed: {formatDisplayDate(condition.diagnosed_date)}
                        </Text>
                      )}
                    </View>
                  )}
                  {condition.notes && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.mutedBrown,
                        lineHeight: 18,
                      }}
                    >
                      {condition.notes}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Current Medications */}
        <SectionHeader
          title="Current Medications"
          icon={Pill}
          section="medications"
          count={summary?.medicationsCount || 0}
        />
        {expandedSections.medications && (
          <EmptyState
            icon={Pill}
            title="No current medications"
            description="Add medications or supplements your dog is currently taking."
          />
        )}

        {/* Vaccination History — driven by pet_vaccinations (source of truth) */}
        <SectionHeader
          title="Vaccination History"
          icon={Syringe}
          section="vaccines"
          count={vaccinations.length}
        />
        {expandedSections.vaccines && (
          <View style={{ marginBottom: 16 }}>
            {vaccinationsLoading ? (
              <View
                style={{
                  backgroundColor: MATERIALS.surface,
                  borderRadius: 16,
                  padding: 24,
                  borderWidth: 1.5,
                  borderColor: MATERIALS.hairline,
                  alignItems: "center",
                }}
              >
                <ActivityIndicator size="small" color={COLORS.sage} />
              </View>
            ) : vaccinationsError ? (
              <View
                style={{
                  backgroundColor: MATERIALS.surface,
                  borderRadius: 16,
                  padding: 24,
                  borderWidth: 1.5,
                  borderColor: MATERIALS.hairline,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  Couldn't load vaccinations. Pull to refresh.
                </Text>
              </View>
            ) : vaccinations.length === 0 ? (
              <EmptyState
                icon={Syringe}
                title="No vaccinations yet"
                description="Add vaccine records to keep your dog's medical history complete."
              />
            ) : (
              vaccinations.map((vaccine) => (
                <View
                  key={vaccine.id}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {vaccine.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      marginBottom: vaccine.expires_on || vaccine.lot ? 4 : 0,
                    }}
                  >
                    {vaccine.date_given
                      ? formatDisplayDate(vaccine.date_given)
                      : "Date not recorded"}
                  </Text>
                  {vaccine.expires_on && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                        marginBottom: vaccine.lot ? 4 : 0,
                      }}
                    >
                      Expires {formatDisplayDate(vaccine.expires_on)}
                    </Text>
                  )}
                  {vaccine.lot && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      Lot {vaccine.lot}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Vet Visit History */}
        <SectionHeader
          title="Vet Visit History"
          icon={Stethoscope}
          section="visits"
          count={summary?.completedAppointmentsCount || 0}
        />
        {expandedSections.visits && (
          <EmptyState
            icon={Stethoscope}
            title="No vet visits yet"
            description="Completed appointments and visit notes will appear here."
          />
        )}

        {/* Surgery History */}
        <SectionHeader
          title="Surgery History"
          icon={Scissors}
          section="surgeries"
          count={summary?.surgeriesCount || 0}
        />
        {expandedSections.surgeries && (
          <View style={{ marginBottom: 16 }}>
            {surgeriesData?.surgeries?.length === 0 ? (
              <EmptyState
                icon={Scissors}
                title="No surgeries added"
                description="Add surgery records or upload reports when needed."
              />
            ) : (
              surgeriesData?.surgeries?.map((surgery) => (
                <TouchableOpacity
                  key={surgery.id}
                  onPress={() => setSelectedSurgery(surgery)}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {surgery.procedure}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      marginBottom: 4,
                    }}
                  >
                    {formatDisplayDate(surgery.surgery_date)}
                  </Text>
                  {surgery.surgeon && surgery.clinic && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      {surgery.surgeon} • {surgery.clinic}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Lab Results */}
        <SectionHeader
          title="Lab Results"
          icon={FlaskConical}
          section="labs"
          count={summary?.labResultsCount || 0}
        />
        {expandedSections.labs && (
          <View style={{ marginBottom: 16 }}>
            {labResultsData?.labResults?.length === 0 ? (
              <EmptyState
                icon={FlaskConical}
                title="No lab results yet"
                description="Upload or add bloodwork, imaging, or test results."
              />
            ) : (
              labResultsData?.labResults?.map((lab) => (
                <TouchableOpacity
                  key={lab.id}
                  onPress={() => setSelectedLab(lab)}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {lab.test_name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      marginBottom: 4,
                    }}
                  >
                    {formatDisplayDate(lab.test_date)}
                  </Text>
                  {lab.results && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: COLORS.warmBrown,
                        fontWeight: "600",
                        marginTop: 6,
                      }}
                    >
                      {lab.results}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Documents */}
        <SectionHeader
          title="Documents"
          icon={FileText}
          section="documents"
          count={summary?.documentsCount || 0}
        />
        {expandedSections.documents && (
          <View style={{ marginBottom: 16 }}>
            {/* Owner upload (ticket 2.41) */}
            <TouchableOpacity
              testID="add-document"
              onPress={() => setAddDocVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: COLORS.coral + "15",
                borderRadius: 14,
                paddingVertical: 14,
                marginBottom: 12,
                borderWidth: 1.5,
                borderColor: COLORS.coral,
                borderStyle: "dashed",
              }}
            >
              <Plus size={18} color={COLORS.coral} />
              <Text style={{ color: COLORS.coral, fontWeight: "700", fontSize: 14 }}>
                Add document
              </Text>
            </TouchableOpacity>

            {documentsData?.documents?.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload lab results, prescriptions, invoices, insurance papers, or vet reports."
              />
            ) : (
              documentsData?.documents?.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  testID="vet-document-row"
                  onPress={() => openDocument(doc)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: COLORS.coral + "20",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <FileText size={18} color={COLORS.coral} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: COLORS.warmBrown,
                        marginBottom: 3,
                      }}
                    >
                      {doc.name}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {doc.document_date && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {formatDisplayDate(doc.document_date)}
                        </Text>
                      )}
                      <View
                        style={{
                          backgroundColor: MATERIALS.surfaceSunken,
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {doc.document_type}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    testID="delete-document"
                    onPress={() => deleteDocument(doc)}
                    hitSlop={8}
                  >
                    <Trash2 size={18} color={COLORS.mutedBrown} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Photo History */}
        <SectionHeader
          title="Photo History"
          icon={Camera}
          section="photoHistory"
          count={summary?.photoChecksCount || 0}
        />
        {expandedSections.photoHistory && (
          <View
            style={{
              backgroundColor: MATERIALS.surface,
              borderRadius: 16,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: MATERIALS.hairline,
            }}
          >
            {summary?.photoChecksCount === 0 ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  No photo checks yet. Photo checks from paws, eyes, ears, skin,
                  and more will appear here.
                </Text>
              </View>
            ) : (
              <PhotoHistory />
            )}
          </View>
        )}

        {/* History (append-only clinical log, ticket 2.42) */}
        <SectionHeader
          title="History"
          icon={ClipboardList}
          section="vetNotes"
          count={summary?.vetNotesCount || 0}
        />
        {expandedSections.vetNotes && (
          <View style={{ marginBottom: 16 }}>
            {/* General summary — a real derived recap, not the AI summary (2.50) */}
            {historyNotes.length > 0 && (
              <View
                style={{
                  backgroundColor: MATERIALS.surfaceSunken,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: MATERIALS.hairline,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.mutedBrown, letterSpacing: 0.6 }}>
                  GENERAL SUMMARY
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.warmBrown, marginTop: 4, fontWeight: "600" }}>
                  {`${historyNotes.length} ${historyNotes.length === 1 ? "entry" : "entries"} · last updated ${formatDisplayDate(historyNotes[0].note_date)}${historyNotes[0].vet_name ? ` by ${historyNotes[0].vet_name}` : ""}`}
                </Text>
              </View>
            )}

            {/* Owner add entry */}
            <TouchableOpacity
              testID="add-vet-note"
              onPress={() => setAddNoteVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: COLORS.coral + "15",
                borderRadius: 14,
                paddingVertical: 14,
                marginBottom: 12,
                borderWidth: 1.5,
                borderColor: COLORS.coral,
                borderStyle: "dashed",
              }}
            >
              <Plus size={18} color={COLORS.coral} />
              <Text style={{ color: COLORS.coral, fontWeight: "700", fontSize: 14 }}>
                Add to history
              </Text>
            </TouchableOpacity>

            {vetNotesData?.notes?.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No history yet"
                description="Add a dated entry, or your vet's notes will appear here. History is append-only — entries are kept, not overwritten."
              />
            ) : (
              vetNotesData?.notes?.map((note) => (
                <View
                  key={note.id}
                  style={{
                    backgroundColor: MATERIALS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: MATERIALS.hairline,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    {/* Author label: clinic/vet name, or "You" for owner entries */}
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: COLORS.warmBrown,
                      }}
                    >
                      {note.vet_name || "You"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          color: COLORS.mutedBrown,
                        }}
                      >
                        {formatDisplayDate(note.note_date)}
                      </Text>
                      <TouchableOpacity
                        testID="delete-vet-note"
                        onPress={() => deleteVetNote(note)}
                        hitSlop={8}
                      >
                        <Trash2 size={15} color={COLORS.mutedBrown} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      lineHeight: 18,
                    }}
                  >
                    {note.note}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Bottom Info */}
        <View
          style={{
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: MATERIALS.hairline,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: COLORS.mutedBrown,
              lineHeight: 18,
              textAlign: "center",
            }}
          >
            Keep all vet records in one place. Easily share medical history with
            new vets or specialists.
          </Text>
        </View>
      </View>

      {/* Add Record Picker Modal */}
      <Modal
        visible={showAddRecordPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddRecordPicker(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: COLORS.warmBrown,
                }}
              >
                Add Record
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddRecordPicker(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: MATERIALS.surfaceSunken,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <X size={20} color={COLORS.warmBrown} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
            >
              {[
                { type: "Vet Note", icon: Edit },
                { type: "Document", icon: FileText },
                { type: "Vet Visit", icon: Stethoscope, comingSoon: true },
                { type: "Vaccination", icon: Syringe, comingSoon: true },
                { type: "Medication", icon: Pill, comingSoon: true },
                { type: "Allergy", icon: AlertTriangle, comingSoon: true },
                { type: "Known Condition", icon: Heart, comingSoon: true },
                { type: "Surgery", icon: Scissors, comingSoon: true },
                { type: "Lab Result", icon: FlaskConical, comingSoon: true },
                { type: "Other", icon: Plus, comingSoon: true },
              ].map((record, idx) => {
                const Icon = record.icon;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleRecordTypeSelect(record)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor: MATERIALS.surface,
                      borderRadius: 12,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: MATERIALS.hairline,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: COLORS.coral + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                      }}
                    >
                      <Icon size={20} color={COLORS.coral} />
                    </View>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: COLORS.warmBrown,
                        flex: 1,
                      }}
                    >
                      {record.type}
                    </Text>
                    {record.comingSoon && (
                      <View
                        style={{
                          backgroundColor: MATERIALS.surfaceSunken,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 3,
                          borderWidth: 1,
                          borderColor: MATERIALS.hairline,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {t("health.trackerSoon")}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Surgery Detail Modal */}
      <Modal
        visible={selectedSurgery !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedSurgery(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
            }}
          >
            {selectedSurgery && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: COLORS.warmBrown,
                      flex: 1,
                    }}
                  >
                    {selectedSurgery.procedure}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSelectedSurgery(null)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: MATERIALS.surfaceSunken,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <X size={20} color={COLORS.warmBrown} />
                  </TouchableOpacity>
                </View>

                {[
                  {
                    label: "Date",
                    value: formatDisplayDate(selectedSurgery.surgery_date),
                  },
                  { label: "Surgeon", value: selectedSurgery.surgeon },
                  { label: "Clinic", value: selectedSurgery.clinic },
                  {
                    label: "Complications",
                    value: selectedSurgery.complications,
                  },
                  { label: "Recovery", value: selectedSurgery.recovery },
                  { label: "Notes", value: selectedSurgery.notes },
                ].map(
                  (item, idx) =>
                    item.value && (
                      <View
                        key={idx}
                        style={{
                          marginBottom: 16,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                            marginBottom: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={{
                            backgroundColor: MATERIALS.surface,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: MATERIALS.hairline,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.warmBrown,
                              lineHeight: 19,
                            }}
                          >
                            {item.value}
                          </Text>
                        </View>
                      </View>
                    ),
                )}

                <TouchableOpacity
                  onPress={() => setSelectedSurgery(null)}
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    marginTop: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#FFF",
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Lab Result Detail Modal */}
      <Modal
        visible={selectedLab !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedLab(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
            }}
          >
            {selectedLab && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: COLORS.warmBrown,
                      flex: 1,
                    }}
                  >
                    {selectedLab.test_name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSelectedLab(null)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: MATERIALS.surfaceSunken,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <X size={20} color={COLORS.warmBrown} />
                  </TouchableOpacity>
                </View>

                {[
                  { label: "Date", value: formatDisplayDate(selectedLab.test_date) },
                  { label: "Results", value: selectedLab.results },
                  { label: "Ordered By", value: selectedLab.ordered_by },
                  { label: "Notes", value: selectedLab.notes },
                ].map(
                  (item, idx) =>
                    item.value && (
                      <View
                        key={idx}
                        style={{
                          marginBottom: 16,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                            marginBottom: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={{
                            backgroundColor: MATERIALS.surface,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: MATERIALS.hairline,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: COLORS.warmBrown,
                              lineHeight: 19,
                            }}
                          >
                            {item.value}
                          </Text>
                        </View>
                      </View>
                    ),
                )}

                <TouchableOpacity
                  onPress={() => setSelectedLab(null)}
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    marginTop: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#FFF",
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Medical Profile Modal */}
      {showEditMedicalProfile && (
        <EditMedicalProfileModal
          visible={showEditMedicalProfile}
          onClose={() => setShowEditMedicalProfile(false)}
          petId={currentPet?.id}
          initialData={medicalProfileData}
          onSave={refetchMedicalProfile}
        />
      )}

      {/* Add Document Modal (ticket 2.41) */}
      <AddDocumentModal
        visible={addDocVisible}
        onClose={() => setAddDocVisible(false)}
        petId={currentPet?.id}
        onSaved={refetchDocuments}
      />

      {/* Add History Entry Modal (ticket 2.42) */}
      <AddVetNoteModal
        visible={addNoteVisible}
        onClose={() => setAddNoteVisible(false)}
        petId={currentPet?.id}
        onSaved={refetchVetNotes}
      />
    </RefreshableScrollView>
  );
}
