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
  Pressable,
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
  ClipboardList,
  Trash2,
} from "lucide-react-native";
import { AddDocumentModal } from "./VetRecord/AddDocumentModal";
import { AddVetNoteModal } from "./VetRecord/AddVetNoteModal";
import { AddVetRecordModal } from "./VetRecord/AddVetRecordModal";
import MedicationModal from "./Medication/MedicationModal";
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

// Ordered sub-tabs of the "Medical history" group. Each key drives its own
// list/query/modal below; the parent chip sub-nav renders in this order and the
// screen defaults to the first non-empty tab (or "vaccines").
const HISTORY_TABS = [
  { key: "vaccines", labelKey: "tabVaccines", icon: Syringe },
  { key: "visits", labelKey: "tabVisits", icon: Stethoscope },
  { key: "medications", labelKey: "tabMedications", icon: Pill },
  { key: "labs", labelKey: "tabLabs", icon: FlaskConical },
  { key: "conditions", labelKey: "tabConditions", icon: Heart },
  { key: "notes", labelKey: "tabNotes", icon: ClipboardList },
  { key: "documents", labelKey: "tabDocuments", icon: FileText },
  { key: "photos", labelKey: "tabPhotos", icon: Camera },
];

export default function HealthVetRecord() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();

  // Localized "N items" for section count badges (explicit key select so it works
  // under the test i18n resolver, which doesn't do i18next plural suffixing).
  const countLabel = (n) =>
    t(n === 1 ? "health.vetRecord.count_one" : "health.vetRecord.count_other", {
      count: n,
    });

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

  // Three top-level groups (VR2): profile · next visit · history.
  const [expandedSections, setExpandedSections] = useState({
    profile: false,
    nextVisit: true,
    history: false,
  });

  // Active sub-tab of the Medical history group. `null` = auto (first non-empty);
  // once the owner taps a chip we honor their choice.
  const [historyTab, setHistoryTab] = useState(null);

  const [showAddRecordPicker, setShowAddRecordPicker] = useState(false);
  const [showEditMedicalProfile, setShowEditMedicalProfile] = useState(false);
  const [selectedSurgery, setSelectedSurgery] = useState(null);
  const [selectedLab, setSelectedLab] = useState(null);
  // VR-B: real add flows for the record types the picker used to stub as "Soon".
  // vetRecordModalType drives the shared AddVetRecordModal (allergy/condition/surgery/lab);
  // medicationModalTab drives the reused MedicationModal ("medications"|"vaccines").
  const [vetRecordModalType, setVetRecordModalType] = useState(null);
  const [medicationModalTab, setMedicationModalTab] = useState(null);

  // Localized "Added by {name} · {role} · {date}" line for a record row (VR-B, 0120).
  const renderAttribution = (row) => {
    if (!row) return null;
    const isEditor = row.created_by_role === "editor";
    const name =
      row.created_by_name ||
      t(isEditor ? "health.vetRecord.roleEditor" : "health.vetRecord.you");
    const roleLabel = t(
      isEditor ? "health.vetRecord.roleEditor" : "health.vetRecord.roleOwner",
    );
    const when = row.created_at ? formatDisplayDate(row.created_at) : null;
    return (
      <Text
        style={{
          fontSize: 11,
          color: COLORS.mutedBrown,
          marginTop: 8,
          fontWeight: "500",
        }}
      >
        {when
          ? t("health.vetRecord.addedBy", { name, role: roleLabel, date: when })
          : t("health.vetRecord.addedByNoDate", { name, role: roleLabel })}
      </Text>
    );
  };

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

  const historyOpen = expandedSections.history;

  // Fetch vaccinations — pet_vaccinations is the source of truth post-#87.
  // Owner-scoped; the list length drives the Vaccines tab count badge. Declared
  // up here so the history sub-tab counts (and the auto-selected tab) are known
  // before the per-tab queries decide whether to run.
  const {
    data: vaccinations = [],
    isLoading: vaccinationsLoading,
    error: vaccinationsError,
  } = usePetVaccinations(currentPet?.id);

  // Per-tab counts (summary drives all but vaccines, which comes from its own hook).
  const counts = {
    vaccines: vaccinations.length,
    visits:
      (summary?.completedAppointmentsCount || 0) +
      (summary?.surgeriesCount || 0),
    medications: summary?.medicationsCount || 0,
    labs: summary?.labResultsCount || 0,
    conditions:
      (summary?.allergiesCount || 0) + (summary?.conditionsCount || 0),
    notes: summary?.vetNotesCount || 0,
    documents: summary?.documentsCount || 0,
    photos: summary?.photoChecksCount || 0,
  };
  const totalHistoryCount = Object.values(counts).reduce((a, b) => a + b, 0);

  // Default sub-tab: first non-empty, else the first tab. Honors an explicit tap.
  const autoTab =
    HISTORY_TABS.find((tabDef) => counts[tabDef.key] > 0)?.key || "vaccines";
  const activeTab = historyTab ?? autoTab;

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

  // Fetch allergies (Conditions & allergies tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "conditions",
  });

  // Fetch conditions (Conditions & allergies tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "conditions",
  });

  // Fetch surgeries (Visits & procedures tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "visits",
  });

  // Fetch lab results (Labs tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "labs",
  });

  // Fetch documents (Documents tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "documents",
  });

  // Owner document upload + management (ticket 2.41).
  const [addDocVisible, setAddDocVisible] = useState(false);
  // VR-C: filter the Documents tab by canonical category (null = all).
  const [docCategoryFilter, setDocCategoryFilter] = useState(null);
  const DOC_CATEGORIES = ["vaccine", "lab", "visit", "invoice", "other"];
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
      Alert.alert(
        t("health.vetRecord.deleteDocTitle"),
        t("health.vetRecord.deleteDocBody", { name: doc.name }),
        [
          { text: t("health.vetRecord.cancel"), style: "cancel" },
          {
            text: t("health.vetRecord.delete"),
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
                Alert.alert(
                  t("health.vetRecord.errorTitle"),
                  t("health.vetRecord.deleteDocError"),
                );
              }
            },
          },
        ],
      );
    },
    [refetchDocuments, t],
  );

  // Fetch vet notes (Notes tab)
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
    enabled: !!currentPet?.id && historyOpen && activeTab === "notes",
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
        t("health.vetRecord.deleteNoteTitle"),
        t("health.vetRecord.deleteNoteBody"),
        [
          { text: t("health.vetRecord.cancel"), style: "cancel" },
          {
            text: t("health.vetRecord.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                const res = await fetch(`/api/vet-record/notes?id=${note.id}`, {
                  method: "DELETE",
                });
                if (!res.ok) throw new Error("Failed");
                refetchVetNotes();
              } catch (e) {
                Alert.alert(
                  t("health.vetRecord.errorTitle"),
                  t("health.vetRecord.deleteNoteError"),
                );
              }
            },
          },
        ],
      );
    },
    [refetchVetNotes, t],
  );

  const historyNotes = vetNotesData?.notes || [];

  // Fetch appointments — SAME source as the Health → Today VetAppointmentCountdownCard
  // (`/api/vet-appointments`, queryKey ["vet-appointments", petId]). Always enabled so
  // the Next visit card can surface the soonest scheduled appointment.
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
    enabled: !!currentPet?.id,
  });

  // The next upcoming appointment: soonest scheduled one (completed/past → history).
  const nextAppointment = (() => {
    const appts = upcomingAppointmentsData?.appointments || [];
    const upcoming = appts
      .filter((a) => a.status === "scheduled" || a.status == null)
      .sort((a, b) =>
        `${a.appointment_date}T${a.appointment_time || ""}`.localeCompare(
          `${b.appointment_date}T${b.appointment_time || ""}`,
        ),
      );
    return upcoming[0] || null;
  })();

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Open the owner's trust screen for the active pet: who has (or has requested)
  // access to this pet's record, where the owner approves / denies / revokes.
  const handleShare = () => {
    router.push("/(tabs)/more/data-access");
  };

  const handleAddRecord = () => {
    setShowAddRecordPicker(true);
  };

  // Open the Emergency Card (ticket 2.51) for the active pet.
  const handleEmergencyCard = () => {
    if (currentPet?.id == null) return;
    router.push(`/emergency-card?petId=${currentPet.id}`);
  };

  // VR-B: every record type now opens a real add flow. Each opens the Medical history
  // group on the sub-tab where the new entry will appear, then launches the right modal:
  //   note/visit/other → AddVetNoteModal · document → AddDocumentModal
  //   vaccination/medication → MedicationModal (reused) · allergy/condition/surgery/lab
  //   → the shared AddVetRecordModal.
  const openHistoryTab = (tab) => {
    setExpandedSections((prev) => ({ ...prev, history: true }));
    setHistoryTab(tab);
  };

  const handleRecordTypeSelect = (record) => {
    setShowAddRecordPicker(false);
    switch (record?.key) {
      case "vetNote":
      case "vetVisit":
      case "other":
        openHistoryTab("notes");
        setAddNoteVisible(true);
        return;
      case "document":
        openHistoryTab("documents");
        setAddDocVisible(true);
        return;
      case "vaccination":
        openHistoryTab("vaccines");
        setMedicationModalTab("vaccines");
        return;
      case "medication":
        openHistoryTab("medications");
        setMedicationModalTab("medications");
        return;
      case "allergy":
        openHistoryTab("conditions");
        setVetRecordModalType("allergy");
        return;
      case "condition":
        openHistoryTab("conditions");
        setVetRecordModalType("condition");
        return;
      case "surgery":
        openHistoryTab("visits");
        setVetRecordModalType("surgery");
        return;
      case "lab":
        openHistoryTab("labs");
        setVetRecordModalType("lab");
        return;
      default:
        return;
    }
  };

  // Invalidate the record queries touched by an add flow (+ the summary counts).
  const invalidateRecordKeys = useCallback(
    (keys) => {
      if (currentPet?.id == null) return;
      [...keys, "vet-record-summary"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k, currentPet.id] }),
      );
    },
    [queryClient, currentPet?.id],
  );

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
          borderColor: expandedSections[section]
            ? COLORS.coral
            : MATERIALS.hairline,
        },
        ELEVATION.sm,
      ]}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}
      >
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
              {countLabel(count)}
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
          {
            color: COLORS.warmBrown,
            marginBottom: SPACING.sm,
            textAlign: "center",
          },
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
          {t("health.vetRecord.loading")}
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
          {t("health.vetRecord.noPet")}
        </Text>
      </View>
    );
  }

  // ------- Medical history sub-tab content -------
  const renderHistoryContent = () => {
    switch (activeTab) {
      case "vaccines":
        return (
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
                  {t("health.vetRecord.vaccinesError")}
                </Text>
              </View>
            ) : vaccinations.length === 0 ? (
              <EmptyState
                icon={Syringe}
                title={t("health.vetRecord.vaccinesEmptyTitle")}
                description={t("health.vetRecord.vaccinesEmptyDesc")}
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
                      : t("health.vetRecord.dateNotRecorded")}
                  </Text>
                  {vaccine.expires_on && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                        marginBottom: vaccine.lot ? 4 : 0,
                      }}
                    >
                      {t("health.vetRecord.expires", {
                        date: formatDisplayDate(vaccine.expires_on),
                      })}
                    </Text>
                  )}
                  {vaccine.lot && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      {t("health.vetRecord.lot", { lot: vaccine.lot })}
                    </Text>
                  )}
                  {renderAttribution(vaccine)}
                </View>
              ))
            )}
          </View>
        );

      case "visits": {
        const surgeries = surgeriesData?.surgeries || [];
        return (
          <View style={{ marginBottom: 16 }}>
            {surgeries.length === 0 && counts.visits === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title={t("health.vetRecord.visitsEmptyTitle")}
                description={t("health.vetRecord.visitsEmptyDesc")}
              />
            ) : surgeries.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title={t("health.vetRecord.visitsEmptyTitle")}
                description={t("health.vetRecord.visitsEmptyDesc")}
              />
            ) : (
              surgeries.map((surgery) => (
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
                  {renderAttribution(surgery)}
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      }

      case "medications":
        return (
          <EmptyState
            icon={Pill}
            title={t("health.vetRecord.medsEmptyTitle")}
            description={t("health.vetRecord.medsEmptyDesc")}
          />
        );

      case "labs":
        return (
          <View style={{ marginBottom: 16 }}>
            {(labResultsData?.labResults || []).length === 0 ? (
              <EmptyState
                icon={FlaskConical}
                title={t("health.vetRecord.labsEmptyTitle")}
                description={t("health.vetRecord.labsEmptyDesc")}
              />
            ) : (
              labResultsData.labResults.map((lab) => (
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
                  {renderAttribution(lab)}
                </TouchableOpacity>
              ))
            )}
          </View>
        );

      case "conditions": {
        const allergies = allergiesData?.allergies || [];
        const conditions = conditionsData?.conditions || [];
        if (allergies.length === 0 && conditions.length === 0) {
          return (
            <EmptyState
              icon={AlertTriangle}
              title={t("health.vetRecord.conditionsAllergiesEmptyTitle")}
              description={t("health.vetRecord.conditionsAllergiesEmptyDesc")}
            />
          );
        }
        return (
          <View style={{ marginBottom: 16 }}>
            {allergies.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: COLORS.mutedBrown,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  {t("health.vetRecord.allergiesHeading")}
                </Text>
                {allergies.map((allergy) => (
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
                          {t("health.vetRecord.severity", {
                            level: allergy.severity,
                          })}
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
                        {t("health.vetRecord.reaction", {
                          value: allergy.reaction,
                        })}
                      </Text>
                    )}
                    {allergy.diagnosed_date && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: COLORS.mutedBrown,
                        }}
                      >
                        {t("health.vetRecord.diagnosed", {
                          date: formatDisplayDate(allergy.diagnosed_date),
                        })}
                      </Text>
                    )}
                    {renderAttribution(allergy)}
                  </View>
                ))}
              </>
            )}

            {conditions.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: COLORS.mutedBrown,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: 10,
                    marginTop: allergies.length > 0 ? 8 : 0,
                  }}
                >
                  {t("health.vetRecord.conditionsHeading")}
                </Text>
                {conditions.map((condition) => (
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
                            {t("health.vetRecord.diagnosed", {
                              date: formatDisplayDate(condition.diagnosed_date),
                            })}
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
                    {renderAttribution(condition)}
                  </View>
                ))}
              </>
            )}
          </View>
        );
      }

      case "notes":
        return (
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
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "800",
                    color: COLORS.mutedBrown,
                    letterSpacing: 0.6,
                  }}
                >
                  {t("health.vetRecord.notesGeneralSummary")}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.warmBrown,
                    marginTop: 4,
                    fontWeight: "600",
                  }}
                >
                  {t(
                    historyNotes.length === 1
                      ? "health.vetRecord.notesSummaryLine_one"
                      : "health.vetRecord.notesSummaryLine_other",
                    {
                      count: historyNotes.length,
                      date: formatDisplayDate(historyNotes[0].note_date),
                    },
                  )}
                  {historyNotes[0].vet_name
                    ? t("health.vetRecord.notesSummaryBy", {
                        name: historyNotes[0].vet_name,
                      })
                    : ""}
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
              <Text
                style={{ color: COLORS.coral, fontWeight: "700", fontSize: 14 }}
              >
                {t("health.vetRecord.addToHistory")}
              </Text>
            </TouchableOpacity>

            {historyNotes.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={t("health.vetRecord.notesEmptyTitle")}
                description={t("health.vetRecord.notesEmptyDesc")}
              />
            ) : (
              historyNotes.map((note) => (
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
                      {note.vet_name || t("health.vetRecord.you")}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
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
                  {renderAttribution(note)}
                </View>
              ))
            )}
          </View>
        );

      case "documents":
        return (
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
              <Text
                style={{ color: COLORS.coral, fontWeight: "700", fontSize: 14 }}
              >
                {t("health.vetRecord.addDocument")}
              </Text>
            </TouchableOpacity>

            {(() => {
              const allDocs = documentsData?.documents || [];
              // VR-C: group/filter history by canonical category. Untagged rows fall
              // under "other" so every document is reachable from some chip.
              const catOf = (d) =>
                DOC_CATEGORIES.includes(d.category) ? d.category : "other";
              const docs = docCategoryFilter
                ? allDocs.filter((d) => catOf(d) === docCategoryFilter)
                : allDocs;
              return (
                <>
                  {allDocs.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                      style={{ marginBottom: 12 }}
                    >
                      {[null, ...DOC_CATEGORIES].map((cat) => {
                        const active = docCategoryFilter === cat;
                        return (
                          <Pressable
                            key={cat ?? "all"}
                            testID={`doc-filter-${cat ?? "all"}`}
                            onPress={() => setDocCategoryFilter(cat)}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 999,
                              backgroundColor: active
                                ? COLORS.coral
                                : MATERIALS.surface,
                              borderWidth: 1.5,
                              borderColor: active
                                ? COLORS.coral
                                : MATERIALS.hairline,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: active ? "#FFF" : COLORS.warmBrown,
                              }}
                            >
                              {cat
                                ? t(`health.vetRecord.docCategory.${cat}`)
                                : t("health.vetRecord.docFilterAll")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}

                  {docs.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title={t("health.vetRecord.documentsEmptyTitle")}
                      description={t("health.vetRecord.documentsEmptyDesc")}
                    />
                  ) : (
                    docs.map((doc) => (
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
                          {doc.category
                            ? t(`health.vetRecord.docCategory.${doc.category}`)
                            : doc.document_type ||
                              t("health.vetRecord.docCategory.other")}
                        </Text>
                      </View>
                    </View>
                    {renderAttribution(doc)}
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
                </>
              );
            })()}
          </View>
        );

      case "photos":
        return (
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
            {counts.photos === 0 ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  {t("health.vetRecord.photosEmpty")}
                </Text>
              </View>
            ) : (
              <PhotoHistory />
            )}
          </View>
        );

      default:
        return null;
    }
  };

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
            style={[
              TYPE.title,
              { color: COLORS.warmBrown, marginBottom: SPACING.xs + 2 },
            ]}
          >
            {t("health.vetRecord.title")}
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
            {t("health.vetRecord.subtitle", { pet: currentPet.name })}
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
              {t("health.vetRecord.addRecord")}
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
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "700", color: COLORS.warmBrown },
              ]}
            >
              {t("health.vetRecord.share")}
            </Text>
          </PressableScale>
        </View>

        {/* AI-2 (night-run 2026-08-18d): prominent "scan or upload" entry — the whole point is easy
            bulk digitizing, so it lives up top. Opens AddDocumentModal, which reads the file and
            proposes records to review. */}
        <PressableScale
          testID="scan-upload-document"
          onPress={() => setAddDocVisible(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.sm,
            backgroundColor: COLORS.coral + "15",
            borderRadius: RADIUS.control,
            paddingVertical: 14,
            marginBottom: SPACING.lg,
            borderWidth: 1.5,
            borderColor: COLORS.coral,
            borderStyle: "dashed",
          }}
        >
          <Camera size={18} color={COLORS.coral} />
          <Text style={[TYPE.callout, { fontWeight: "800", color: COLORS.coral }]}>
            {t("health.vetRecord.scanUpload")}
          </Text>
        </PressableScale>

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
            {t("health.vetRecord.emergencyCard")}
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
            {t("health.vetRecord.accessControl")}
          </Text>
        </View>

        {/* Prescriptions (ticket 2.53) — owner read-only Rx a vet issued + request refill. */}
        <PrescriptionsSection petId={currentPet?.id} />

        {/* Vet Summary — surfaced top-level (above the three groups) so "Create Vet
            Summary" is always reachable, even with no upcoming appointment booked.
            Reuses the dashboard card + its VetSummaryModal (unchanged). */}
        <VetSummaryDashboard />
        <Text
          style={{
            fontSize: 12,
            color: COLORS.mutedBrown,
            lineHeight: 18,
            marginTop: 4,
            marginBottom: SPACING.lg,
          }}
        >
          {t("health.vetRecord.readinessHint", { pet: currentPet.name })}
        </Text>

        {/* ============ GROUP 1 — Medical profile ============ */}
        <SectionHeader
          title={t("health.vetRecord.groupProfile")}
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
                  {t("health.vetRecord.profileEmptyTitle")}
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
                  {t("health.vetRecord.profileEmptyDesc")}
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
                    {t("health.vetRecord.profileComplete")}
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
                      {t("health.vetRecord.sectionBasic")}
                    </Text>
                    {[
                      {
                        label: t("health.vetRecord.fieldBreed"),
                        value: medicalProfileData?.pet?.breed,
                      },
                      {
                        label: t("health.vetRecord.fieldAge"),
                        value: getDisplayAge(medicalProfileData?.pet),
                      },
                      {
                        label: t("health.vetRecord.fieldSex"),
                        value: medicalProfileData?.pet?.gender,
                      },
                      {
                        label: t("health.vetRecord.fieldBirthday"),
                        value: medicalProfileData?.pet?.birthday
                          ? formatDisplayDate(medicalProfileData.pet.birthday)
                          : null,
                      },
                      {
                        label: t("health.vetRecord.fieldAdoption"),
                        value: medicalProfileData?.pet?.adoption_date
                          ? formatDisplayDate(
                              medicalProfileData.pet.adoption_date,
                            )
                          : null,
                      },
                      {
                        label: t("health.vetRecord.fieldWeight"),
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
                      {t("health.vetRecord.sectionMedical")}
                    </Text>
                    {[
                      {
                        label: t("health.vetRecord.fieldSpayNeuter"),
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
                        label: t("health.vetRecord.fieldMicrochip"),
                        value: medicalProfileData.medicalProfile.microchip_id,
                      },
                      {
                        label: t("health.vetRecord.fieldPrimaryVet"),
                        value:
                          medicalProfileData.medicalProfile.primary_vet_name,
                      },
                      {
                        label: t("health.vetRecord.fieldPrimaryClinic"),
                        value:
                          medicalProfileData.medicalProfile.primary_clinic_name,
                      },
                      {
                        label: t("health.vetRecord.fieldVetPhone"),
                        value: medicalProfileData.medicalProfile.vet_phone,
                      },
                      {
                        label: t("health.vetRecord.fieldVetEmail"),
                        value: medicalProfileData.medicalProfile.vet_email,
                      },
                      {
                        label: t("health.vetRecord.fieldEmergencyContact"),
                        value:
                          medicalProfileData.medicalProfile
                            .emergency_contact_name,
                      },
                      {
                        label: t("health.vetRecord.fieldEmergencyPhone"),
                        value:
                          medicalProfileData.medicalProfile
                            .emergency_contact_phone,
                      },
                      {
                        label: t("health.vetRecord.fieldInsurance"),
                        value:
                          medicalProfileData.medicalProfile.insurance_provider,
                      },
                      {
                        label: t("health.vetRecord.fieldPolicy"),
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
                      {t("health.vetRecord.sectionNotes")}
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
                    {t("health.vetRecord.profileEdit")}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ============ GROUP 2 — Next visit ============ */}
        <SectionHeader
          title={t("health.vetRecord.groupNextVisit")}
          icon={Calendar}
          section="nextVisit"
        />
        {expandedSections.nextVisit && (
          <View style={{ marginBottom: 16 }}>
            {/* The soonest scheduled appointment (one source of truth), or empty state */}
            {nextAppointment ? (
              <View
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
                  {nextAppointment.title}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: COLORS.mutedBrown,
                    marginBottom: 3,
                  }}
                >
                  {t("health.vetRecord.apptAt", {
                    date: formatDisplayDate(nextAppointment.appointment_date),
                    time: nextAppointment.appointment_time,
                  })}
                </Text>
                {nextAppointment.clinic && (
                  <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
                    {nextAppointment.clinic}
                  </Text>
                )}
                {nextAppointment.reason_for_visit && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.mutedBrown,
                      fontStyle: "italic",
                      marginTop: 3,
                    }}
                  >
                    {nextAppointment.reason_for_visit}
                  </Text>
                )}
              </View>
            ) : (
              <EmptyState
                icon={Calendar}
                title={t("health.vetRecord.nextVisitEmptyTitle")}
                description={t("health.vetRecord.nextVisitEmptyDesc")}
              />
            )}
          </View>
        )}

        {/* ============ GROUP 3 — Medical history ============ */}
        <SectionHeader
          title={t("health.vetRecord.groupHistory")}
          icon={ClipboardList}
          section="history"
          count={totalHistoryCount}
        />
        {expandedSections.history && (
          <View style={{ marginBottom: 16 }}>
            {/* Compact, scrollable segmented sub-nav (like the Quick Check stepper) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              style={{ marginBottom: 14 }}
            >
              {HISTORY_TABS.map((tabDef) => {
                const Icon = tabDef.icon;
                const isCurrent = activeTab === tabDef.key;
                const c = counts[tabDef.key];
                return (
                  <Pressable
                    key={tabDef.key}
                    testID={`history-tab-${tabDef.key}`}
                    onPress={() => setHistoryTab(tabDef.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCurrent }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: isCurrent
                        ? COLORS.coral
                        : MATERIALS.surface,
                      borderWidth: 1.5,
                      borderColor: isCurrent ? COLORS.coral : MATERIALS.hairline,
                    }}
                  >
                    <Icon
                      size={15}
                      color={isCurrent ? "#FFF" : COLORS.mutedBrown}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: isCurrent ? "#FFF" : COLORS.warmBrown,
                      }}
                    >
                      {t(`health.vetRecord.${tabDef.labelKey}`)}
                    </Text>
                    {c > 0 && (
                      <View
                        style={{
                          minWidth: 18,
                          paddingHorizontal: 5,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: isCurrent
                            ? "rgba(255,255,255,0.3)"
                            : COLORS.coral + "20",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "800",
                            color: isCurrent ? "#FFF" : COLORS.coral,
                          }}
                        >
                          {c}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {renderHistoryContent()}
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
            {t("health.vetRecord.footer")}
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
                {t("health.vetRecord.addRecordTitle")}
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
                { key: "vetNote", labelKey: "recordVetNote", icon: Edit },
                { key: "document", labelKey: "recordDocument", icon: FileText },
                { key: "vetVisit", labelKey: "recordVetVisit", icon: Stethoscope },
                { key: "vaccination", labelKey: "recordVaccination", icon: Syringe },
                { key: "medication", labelKey: "recordMedication", icon: Pill },
                { key: "allergy", labelKey: "recordAllergy", icon: AlertTriangle },
                { key: "condition", labelKey: "recordCondition", icon: Heart },
                { key: "surgery", labelKey: "recordSurgery", icon: Scissors },
                { key: "lab", labelKey: "recordLab", icon: FlaskConical },
                { key: "other", labelKey: "recordOther", icon: Plus },
              ].map((record, idx) => {
                const Icon = record.icon;
                const label = t(`health.vetRecord.${record.labelKey}`);
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() =>
                      handleRecordTypeSelect({ ...record, label })
                    }
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
                      {label}
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
                    label: t("health.vetRecord.detailDate"),
                    value: formatDisplayDate(selectedSurgery.surgery_date),
                  },
                  {
                    label: t("health.vetRecord.detailSurgeon"),
                    value: selectedSurgery.surgeon,
                  },
                  {
                    label: t("health.vetRecord.detailClinic"),
                    value: selectedSurgery.clinic,
                  },
                  {
                    label: t("health.vetRecord.detailComplications"),
                    value: selectedSurgery.complications,
                  },
                  {
                    label: t("health.vetRecord.detailRecovery"),
                    value: selectedSurgery.recovery,
                  },
                  {
                    label: t("health.vetRecord.detailNotes"),
                    value: selectedSurgery.notes,
                  },
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
                    {t("health.vetRecord.close")}
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
                  {
                    label: t("health.vetRecord.detailDate"),
                    value: formatDisplayDate(selectedLab.test_date),
                  },
                  {
                    label: t("health.vetRecord.detailResults"),
                    value: selectedLab.results,
                  },
                  {
                    label: t("health.vetRecord.detailOrderedBy"),
                    value: selectedLab.ordered_by,
                  },
                  {
                    label: t("health.vetRecord.detailNotes"),
                    value: selectedLab.notes,
                  },
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
                    {t("health.vetRecord.close")}
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

      {/* VR-B: allergy / condition / surgery / lab add form (shared modal). */}
      <AddVetRecordModal
        visible={vetRecordModalType !== null}
        recordType={vetRecordModalType}
        petId={currentPet?.id}
        onClose={() => setVetRecordModalType(null)}
        onSaved={() =>
          invalidateRecordKeys([
            "vet-record-allergies",
            "vet-record-conditions",
            "vet-record-surgeries",
            "vet-record-lab-results",
          ])
        }
      />

      {/* VR-B: vaccination / medication reuse the Medications & Care modal. */}
      {medicationModalTab && (
        <MedicationModal
          visible={medicationModalTab !== null}
          initialTab={medicationModalTab}
          petId={currentPet?.id}
          onClose={() => {
            setMedicationModalTab(null);
            invalidateRecordKeys(["pet-vaccinations"]);
          }}
        />
      )}
    </RefreshableScrollView>
  );
}
