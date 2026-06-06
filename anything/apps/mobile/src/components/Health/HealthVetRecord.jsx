import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useCurrentPet } from "@/hooks/usePetProfile";
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
} from "lucide-react-native";
import PhotoHistory from "./PhotoCheck/PhotoHistory";
import VetSummaryDashboard from "./VetSummary/VetSummaryDashboard";
import EditMedicalProfileModal from "./VetRecord/EditMedicalProfileModal";

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

export default function HealthVetRecord() {
  const insets = useSafeAreaInsets();
  const { data: currentPet } = useCurrentPet();

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

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleShare = () => {
    Alert.alert(
      "Coming Soon",
      "Vet sharing is coming next. Once your records are connected, you'll be able to choose what to share.",
      [{ text: "OK" }],
    );
  };

  const handleAddRecord = () => {
    setShowAddRecordPicker(true);
  };

  const handleRecordTypeSelect = (type) => {
    setShowAddRecordPicker(false);
    Alert.alert("Coming Soon", `The ${type} form will be added next.`);
  };

  const SectionHeader = ({ title, icon: Icon, section, count }) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: expandedSections[section] ? 12 : 16,
        borderWidth: 1.5,
        borderColor: expandedSections[section] ? C.coral : C.peach,
        shadowColor: C.terracotta,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: C.coral + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={18} color={C.coral} />
        </View>
        <View>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
            }}
          >
            {title}
          </Text>
          {count !== undefined && (
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                marginTop: 2,
              }}
            >
              {count} {count === 1 ? "item" : "items"}
            </Text>
          )}
        </View>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={C.mutedBrown} />
      ) : (
        <ChevronDown size={20} color={C.mutedBrown} />
      )}
    </TouchableOpacity>
  );

  const EmptyState = ({ icon: Icon, title, description }) => (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 24,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: C.peach,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Icon size={28} color={C.mutedBrown} />
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: C.mutedBrown,
          textAlign: "center",
          lineHeight: 19,
        }}
      >
        {description}
      </Text>
    </View>
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

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
        <ActivityIndicator size="large" color={C.sage} />
        <Text style={{ marginTop: 16, fontSize: 14, color: C.mutedBrown }}>
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
          style={{ fontSize: 16, color: C.mutedBrown, textAlign: "center" }}
        >
          No pet selected
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <View style={{ padding: 16 }}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 6,
              letterSpacing: -0.5,
            }}
          >
            Vet Record
          </Text>
          <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
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
          <TouchableOpacity
            onPress={handleAddRecord}
            style={{
              flex: 1,
              backgroundColor: C.coral,
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              shadowColor: C.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Plus size={18} color="#FFF" />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: "#FFF",
              }}
            >
              Add Record
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={{
              flex: 1,
              backgroundColor: C.card,
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1.5,
              borderColor: C.peach,
            }}
          >
            <Share2 size={18} color={C.terracotta} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
              }}
            >
              Share
            </Text>
          </TouchableOpacity>
        </View>

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

        {/* Pet Medical Profile */}
        <SectionHeader
          title="Pet Medical Profile"
          icon={User}
          section="profile"
        />
        {expandedSections.profile && (
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 16,
              padding: 18,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: C.peach,
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
                    backgroundColor: C.sand,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <User size={28} color={C.mutedBrown} />
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  Medical profile not completed
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
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
                    backgroundColor: C.coral,
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
                        color: C.mutedBrown,
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
                        value: medicalProfileData?.pet?.age_years
                          ? `${medicalProfileData.pet.age_years} years${medicalProfileData.pet.age_months ? `, ${medicalProfileData.pet.age_months} months` : ""}`
                          : null,
                      },
                      { label: "Sex", value: medicalProfileData?.pet?.gender },
                      {
                        label: "Birthday",
                        value: medicalProfileData?.pet?.birthday
                          ? formatDate(medicalProfileData.pet.birthday)
                          : null,
                      },
                      {
                        label: "Adoption Date",
                        value: medicalProfileData?.pet?.adoption_date
                          ? formatDate(medicalProfileData.pet.adoption_date)
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
                            borderBottomColor: C.sand,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.mutedBrown,
                              fontWeight: "600",
                              width: 140,
                            }}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.warmBrown,
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
                        color: C.mutedBrown,
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
                                ? ` (${formatDate(medicalProfileData.medicalProfile.spayed_neutered_date)})`
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
                            borderBottomColor: C.sand,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.mutedBrown,
                              fontWeight: "600",
                              width: 140,
                            }}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.warmBrown,
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
                        color: C.mutedBrown,
                        marginBottom: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Medical Notes
                    </Text>
                    <View
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: C.warmBrown,
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
                    backgroundColor: C.sand,
                    borderRadius: 12,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Edit size={16} color={C.terracotta} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.terracotta,
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
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.sage,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    {appt.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 3,
                    }}
                  >
                    {formatDate(appt.appointment_date)} at{" "}
                    {appt.appointment_time}
                  </Text>
                  {appt.clinic && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
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
                    backgroundColor: C.card,
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
                      color: C.warmBrown,
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
                        color: C.mutedBrown,
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
                        color: C.mutedBrown,
                      }}
                    >
                      Diagnosed: {formatDate(allergy.diagnosed_date)}
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
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
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
                              : C.sage + "20",
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
                                : C.sage,
                          }}
                        >
                          {condition.status}
                        </Text>
                      </View>
                      {condition.diagnosed_date && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: C.mutedBrown,
                          }}
                        >
                          Diagnosed: {formatDate(condition.diagnosed_date)}
                        </Text>
                      )}
                    </View>
                  )}
                  {condition.notes && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
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

        {/* Vaccination History */}
        <SectionHeader
          title="Vaccination History"
          icon={Syringe}
          section="vaccines"
          count={summary?.vaccinesCount || 0}
        />
        {expandedSections.vaccines && (
          <EmptyState
            icon={Syringe}
            title="No vaccinations yet"
            description="Add vaccine records to keep your dog's medical history complete."
          />
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
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {surgery.procedure}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 4,
                    }}
                  >
                    {formatDate(surgery.surgery_date)}
                  </Text>
                  {surgery.surgeon && surgery.clinic && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
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
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 6,
                    }}
                  >
                    {lab.test_name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      marginBottom: 4,
                    }}
                  >
                    {formatDate(lab.test_date)}
                  </Text>
                  {lab.results && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: C.warmBrown,
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
            {documentsData?.documents?.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload lab results, prescriptions, invoices, insurance papers, or vet reports."
              />
            ) : (
              documentsData?.documents?.map((doc) => (
                <View
                  key={doc.id}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
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
                      backgroundColor: C.coral + "20",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <FileText size={18} color={C.coral} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: C.warmBrown,
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
                            color: C.mutedBrown,
                          }}
                        >
                          {formatDate(doc.document_date)}
                        </Text>
                      )}
                      <View
                        style={{
                          backgroundColor: C.sand,
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: C.mutedBrown,
                          }}
                        >
                          {doc.document_type}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
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
              backgroundColor: C.card,
              borderRadius: 16,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1.5,
              borderColor: C.peach,
            }}
          >
            {summary?.photoChecksCount === 0 ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
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

        {/* Vet Notes */}
        <SectionHeader
          title="Vet Notes"
          icon={Edit}
          section="vetNotes"
          count={summary?.vetNotesCount || 0}
        />
        {expandedSections.vetNotes && (
          <View style={{ marginBottom: 16 }}>
            {vetNotesData?.notes?.length === 0 ? (
              <EmptyState
                icon={Edit}
                title="No vet notes yet"
                description="Add notes from vet visits or questions for your veterinarian."
              />
            ) : (
              vetNotesData?.notes?.map((note) => (
                <View
                  key={note.id}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: C.peach,
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
                    {note.vet_name && (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: C.warmBrown,
                        }}
                      >
                        {note.vet_name}
                      </Text>
                    )}
                    <Text
                      style={{
                        fontSize: 11,
                        color: C.mutedBrown,
                      }}
                    >
                      {formatDate(note.note_date)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
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
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
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
              backgroundColor: C.cream,
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
                  color: C.warmBrown,
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
                  backgroundColor: C.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <X size={20} color={C.warmBrown} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
            >
              {[
                { type: "Vet Visit", icon: Stethoscope },
                { type: "Vaccination", icon: Syringe },
                { type: "Medication", icon: Pill },
                { type: "Allergy", icon: AlertTriangle },
                { type: "Known Condition", icon: Heart },
                { type: "Surgery", icon: Scissors },
                { type: "Lab Result", icon: FlaskConical },
                { type: "Document", icon: FileText },
                { type: "Vet Note", icon: Edit },
                { type: "Other", icon: Plus },
              ].map((record, idx) => {
                const Icon = record.icon;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleRecordTypeSelect(record.type)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor: C.card,
                      borderRadius: 12,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: C.peach,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: C.coral + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                      }}
                    >
                      <Icon size={20} color={C.coral} />
                    </View>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: C.warmBrown,
                      }}
                    >
                      {record.type}
                    </Text>
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
              backgroundColor: C.cream,
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
                      color: C.warmBrown,
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
                      backgroundColor: C.sand,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <X size={20} color={C.warmBrown} />
                  </TouchableOpacity>
                </View>

                {[
                  {
                    label: "Date",
                    value: formatDate(selectedSurgery.surgery_date),
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
                            color: C.mutedBrown,
                            marginBottom: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={{
                            backgroundColor: C.card,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.peach,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.warmBrown,
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
                    backgroundColor: C.coral,
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
              backgroundColor: C.cream,
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
                      color: C.warmBrown,
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
                      backgroundColor: C.sand,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <X size={20} color={C.warmBrown} />
                  </TouchableOpacity>
                </View>

                {[
                  { label: "Date", value: formatDate(selectedLab.test_date) },
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
                            color: C.mutedBrown,
                            marginBottom: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={{
                            backgroundColor: C.card,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.peach,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: C.warmBrown,
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
                    backgroundColor: C.coral,
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
    </ScrollView>
  );
}
