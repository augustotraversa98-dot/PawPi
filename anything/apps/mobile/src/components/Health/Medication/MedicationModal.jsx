import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  X,
  Pill,
  Syringe,
  Shield,
  Plus,
  CheckCircle,
  Calendar,
  Clock,
  FileText,
  Camera,
  Trash2,
  Info,
  Bell,
  BellOff,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getCurrentMedications,
  getPastMedications,
  getVaccines,
  getPreventiveTreatments,
  addMedication,
  addVaccine,
  addPreventiveTreatment,
  completeMedication,
  FREQUENCIES,
  PREVENTIVE_TYPES,
  formatDate,
  getVaccineStatus,
  getPreventiveStatus,
  getPreventiveTypeLabel,
  getPreventiveTypeEmoji,
} from "@/data/medicationData";
import DateField from "@/components/DateField";
import { parseDateValue } from "@/utils/canonicalDateTime";

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

export default function MedicationModal({
  visible,
  onClose,
  initialTab = "medications",
}) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [showAddForm, setShowAddForm] = useState(false);

  // Medication form state
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medFrequency, setMedFrequency] = useState("");
  const [medPrescribedBy, setMedPrescribedBy] = useState("");
  const [medNotes, setMedNotes] = useState("");
  const [medReminderEnabled, setMedReminderEnabled] = useState(false);

  // Vaccine form state
  const [vaxName, setVaxName] = useState("");
  const [vaxDateGiven, setVaxDateGiven] = useState("");
  const [vaxDueDate, setVaxDueDate] = useState("");
  const [vaxVetClinic, setVaxVetClinic] = useState("");
  const [vaxNotes, setVaxNotes] = useState("");
  const [vaxReminderEnabled, setVaxReminderEnabled] = useState(false);

  // Preventive form state
  const [prevProductName, setPrevProductName] = useState("");
  const [prevType, setPrevType] = useState("");
  const [prevFrequency, setPrevFrequency] = useState("");
  const [prevLastGiven, setPrevLastGiven] = useState("");
  const [prevNextDue, setPrevNextDue] = useState("");
  const [prevNotes, setPrevNotes] = useState("");
  const [prevReminderEnabled, setPrevReminderEnabled] = useState(false);

  const currentMeds = getCurrentMedications();
  const pastMeds = getPastMedications();
  const vaccines = getVaccines();
  const preventives = getPreventiveTreatments();

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowAddForm(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleAddMedication = () => {
    if (!medName.trim()) {
      Alert.alert("Required", "Please enter a medication name");
      return;
    }

    addMedication({
      name: medName,
      dose: medDose,
      frequency: medFrequency,
      prescribedBy: medPrescribedBy,
      notes: medNotes,
      reminderEnabled: medReminderEnabled,
    });

    // Reset form
    setMedName("");
    setMedDose("");
    setMedFrequency("");
    setMedPrescribedBy("");
    setMedNotes("");
    setMedReminderEnabled(false);
    setShowAddForm(false);

    Alert.alert("Added", "Medication added successfully");
  };

  const handleAddVaccine = () => {
    if (!vaxName.trim()) {
      Alert.alert("Required", "Please enter a vaccine name");
      return;
    }

    addVaccine({
      name: vaxName,
      dateGiven: vaxDateGiven
        ? parseDateValue(vaxDateGiven).getTime()
        : Date.now(),
      dueDate: vaxDueDate ? parseDateValue(vaxDueDate).getTime() : null,
      vetClinic: vaxVetClinic,
      notes: vaxNotes,
      reminderEnabled: vaxReminderEnabled,
    });

    // Reset form
    setVaxName("");
    setVaxDateGiven("");
    setVaxDueDate("");
    setVaxVetClinic("");
    setVaxNotes("");
    setVaxReminderEnabled(false);
    setShowAddForm(false);

    Alert.alert("Added", "Vaccine added successfully");
  };

  const handleAddPreventive = () => {
    if (!prevProductName.trim()) {
      Alert.alert("Required", "Please enter a product name");
      return;
    }

    addPreventiveTreatment({
      productName: prevProductName,
      type: prevType || "other",
      frequency: prevFrequency,
      lastGiven: prevLastGiven ? parseDateValue(prevLastGiven).getTime() : null,
      nextDue: prevNextDue ? parseDateValue(prevNextDue).getTime() : null,
      notes: prevNotes,
      reminderEnabled: prevReminderEnabled,
    });

    // Reset form
    setPrevProductName("");
    setPrevType("");
    setPrevFrequency("");
    setPrevLastGiven("");
    setPrevNextDue("");
    setPrevNotes("");
    setPrevReminderEnabled(false);
    setShowAddForm(false);

    Alert.alert("Added", "Preventive care added successfully");
  };

  const handleCompleteMedication = (medId, medName) => {
    Alert.alert(
      "Mark as completed",
      `Mark ${medName} as completed? This will move it to past medications.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark completed",
          onPress: () => {
            completeMedication(medId);
            Alert.alert("Completed", "Medication moved to past medications");
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 20,
            maxHeight: "90%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              marginBottom: 16,
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              Medications & Care
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 20,
              gap: 8,
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => handleTabChange("medications")}
              style={{
                flex: 1,
                backgroundColor: activeTab === "medications" ? C.coral : C.card,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: activeTab === "medications" ? C.coral : C.peach,
              }}
            >
              <Pill
                size={18}
                color={activeTab === "medications" ? "#FFF" : C.warmBrown}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: activeTab === "medications" ? "#FFF" : C.warmBrown,
                  marginTop: 4,
                }}
              >
                Medications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleTabChange("vaccines")}
              style={{
                flex: 1,
                backgroundColor: activeTab === "vaccines" ? C.coral : C.card,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: activeTab === "vaccines" ? C.coral : C.peach,
              }}
            >
              <Syringe
                size={18}
                color={activeTab === "vaccines" ? "#FFF" : C.warmBrown}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: activeTab === "vaccines" ? "#FFF" : C.warmBrown,
                  marginTop: 4,
                }}
              >
                Vaccines
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleTabChange("preventives")}
              style={{
                flex: 1,
                backgroundColor: activeTab === "preventives" ? C.coral : C.card,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: activeTab === "preventives" ? C.coral : C.peach,
              }}
            >
              <Shield
                size={18}
                color={activeTab === "preventives" ? "#FFF" : C.warmBrown}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: activeTab === "preventives" ? "#FFF" : C.warmBrown,
                  marginTop: 4,
                }}
              >
                Preventive
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* MEDICATIONS TAB */}
            {activeTab === "medications" && (
              <View>
                {/* Safety Warning */}
                <View
                  style={{
                    backgroundColor: "#FFF4E6",
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "#FFE4C4",
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <Info size={16} color="#FFB74D" style={{ marginTop: 2 }} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                      flex: 1,
                    }}
                  >
                    Follow your veterinarian's instructions for medication dose
                    and schedule.
                  </Text>
                </View>

                {/* Add Button */}
                {!showAddForm && (
                  <TouchableOpacity
                    onPress={() => setShowAddForm(true)}
                    style={{
                      backgroundColor: C.coral,
                      borderRadius: 14,
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 20,
                    }}
                  >
                    <Plus size={20} color="#FFF" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#FFF",
                      }}
                    >
                      Add medication
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Add Form */}
                {showAddForm && (
                  <View
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.coral,
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: C.warmBrown,
                        marginBottom: 14,
                      }}
                    >
                      Add new medication
                    </Text>

                    <View style={{ gap: 12 }}>
                      <View>
                        <Text style={styles.label}>Medication name *</Text>
                        <TextInput
                          value={medName}
                          onChangeText={setMedName}
                          placeholder="e.g., Carprofen"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Dose</Text>
                        <TextInput
                          value={medDose}
                          onChangeText={setMedDose}
                          placeholder="e.g., 25mg"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Frequency</Text>
                        <TextInput
                          value={medFrequency}
                          onChangeText={setMedFrequency}
                          placeholder="e.g., Twice daily"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Prescribed by</Text>
                        <TextInput
                          value={medPrescribedBy}
                          onChangeText={setMedPrescribedBy}
                          placeholder="e.g., Dr. Sarah Mitchell"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Notes</Text>
                        <TextInput
                          value={medNotes}
                          onChangeText={setMedNotes}
                          placeholder="Any additional notes..."
                          placeholderTextColor={C.mutedBrown + "80"}
                          multiline
                          numberOfLines={3}
                          style={[
                            styles.input,
                            { minHeight: 80, textAlignVertical: "top" },
                          ]}
                        />
                      </View>

                      <TouchableOpacity
                        onPress={() =>
                          setMedReminderEnabled(!medReminderEnabled)
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          backgroundColor: C.sand,
                          borderRadius: 10,
                        }}
                      >
                        {medReminderEnabled ? (
                          <Bell size={18} color={C.sage} />
                        ) : (
                          <BellOff size={18} color={C.mutedBrown} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: C.warmBrown,
                            flex: 1,
                          }}
                        >
                          Enable reminders
                        </Text>
                        {medReminderEnabled && (
                          <CheckCircle size={18} color={C.sage} />
                        )}
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 16,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setShowAddForm(false)}
                        style={{
                          flex: 1,
                          backgroundColor: C.sand,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: C.warmBrown,
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleAddMedication}
                        style={{
                          flex: 1,
                          backgroundColor: C.coral,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: "#FFF",
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Current Medications List */}
                {currentMeds.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: C.warmBrown,
                        marginBottom: 12,
                      }}
                    >
                      Current medications
                    </Text>
                    <View style={{ gap: 10 }}>
                      {currentMeds.map((med) => (
                        <View
                          key={med.id}
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
                              fontSize: 15,
                              fontWeight: "800",
                              color: C.warmBrown,
                              marginBottom: 6,
                            }}
                          >
                            {med.name}
                          </Text>
                          {med.dose && (
                            <Text
                              style={{
                                fontSize: 13,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Dose: {med.dose}
                            </Text>
                          )}
                          {med.frequency && (
                            <Text
                              style={{
                                fontSize: 13,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Frequency: {med.frequency}
                            </Text>
                          )}
                          {med.prescribedBy && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Prescribed by: {med.prescribedBy}
                            </Text>
                          )}
                          {med.notes && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                fontStyle: "italic",
                                marginTop: 6,
                              }}
                            >
                              {med.notes}
                            </Text>
                          )}
                          <TouchableOpacity
                            onPress={() =>
                              handleCompleteMedication(med.id, med.name)
                            }
                            style={{
                              marginTop: 10,
                              backgroundColor: C.sage + "20",
                              borderRadius: 8,
                              padding: 10,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: C.sage,
                              }}
                            >
                              Mark as completed
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Past Medications */}
                {pastMeds.length > 0 && (
                  <View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: C.warmBrown,
                        marginBottom: 12,
                      }}
                    >
                      Past medications
                    </Text>
                    <View style={{ gap: 10 }}>
                      {pastMeds.map((med) => (
                        <View
                          key={med.id}
                          style={{
                            backgroundColor: C.sand + "80",
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.peach + "60",
                            opacity: 0.7,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "800",
                              color: C.warmBrown,
                              marginBottom: 6,
                            }}
                          >
                            {med.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: C.mutedBrown,
                            }}
                          >
                            {formatDate(med.startDate)} -{" "}
                            {formatDate(med.endDate)}
                          </Text>
                          {med.notes && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                fontStyle: "italic",
                                marginTop: 6,
                              }}
                            >
                              {med.notes}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {currentMeds.length === 0 &&
                  pastMeds.length === 0 &&
                  !showAddForm && (
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        textAlign: "center",
                        paddingVertical: 40,
                      }}
                    >
                      No medications added yet
                    </Text>
                  )}
              </View>
            )}

            {/* VACCINES TAB */}
            {activeTab === "vaccines" && (
              <View>
                {/* Add Button */}
                {!showAddForm && (
                  <TouchableOpacity
                    onPress={() => setShowAddForm(true)}
                    style={{
                      backgroundColor: C.coral,
                      borderRadius: 14,
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 20,
                    }}
                  >
                    <Plus size={20} color="#FFF" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#FFF",
                      }}
                    >
                      Add vaccine
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Add Form */}
                {showAddForm && (
                  <View
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.coral,
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: C.warmBrown,
                        marginBottom: 14,
                      }}
                    >
                      Add new vaccine
                    </Text>

                    <View style={{ gap: 12 }}>
                      <View>
                        <Text style={styles.label}>Vaccine name *</Text>
                        <TextInput
                          value={vaxName}
                          onChangeText={setVaxName}
                          placeholder="e.g., Rabies, DHPP"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Date given</Text>
                        <DateField
                          value={vaxDateGiven}
                          onChange={setVaxDateGiven}
                          fieldStyle={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Due/expiration date</Text>
                        <DateField
                          value={vaxDueDate}
                          onChange={setVaxDueDate}
                          fieldStyle={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Vet clinic</Text>
                        <TextInput
                          value={vaxVetClinic}
                          onChangeText={setVaxVetClinic}
                          placeholder="e.g., Happy Paws Veterinary"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Notes</Text>
                        <TextInput
                          value={vaxNotes}
                          onChangeText={setVaxNotes}
                          placeholder="Any additional notes..."
                          placeholderTextColor={C.mutedBrown + "80"}
                          multiline
                          numberOfLines={3}
                          style={[
                            styles.input,
                            { minHeight: 80, textAlignVertical: "top" },
                          ]}
                        />
                      </View>

                      <TouchableOpacity
                        onPress={() =>
                          setVaxReminderEnabled(!vaxReminderEnabled)
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          backgroundColor: C.sand,
                          borderRadius: 10,
                        }}
                      >
                        {vaxReminderEnabled ? (
                          <Bell size={18} color={C.sage} />
                        ) : (
                          <BellOff size={18} color={C.mutedBrown} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: C.warmBrown,
                            flex: 1,
                          }}
                        >
                          Enable reminder
                        </Text>
                        {vaxReminderEnabled && (
                          <CheckCircle size={18} color={C.sage} />
                        )}
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 16,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setShowAddForm(false)}
                        style={{
                          flex: 1,
                          backgroundColor: C.sand,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: C.warmBrown,
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleAddVaccine}
                        style={{
                          flex: 1,
                          backgroundColor: C.coral,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: "#FFF",
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Vaccines List */}
                {vaccines.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {vaccines.map((vax) => {
                      const status = getVaccineStatus(vax);
                      return (
                        <View
                          key={vax.id}
                          style={{
                            backgroundColor: C.card,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.peach,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              marginBottom: 8,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "800",
                                color: C.warmBrown,
                                flex: 1,
                              }}
                            >
                              {vax.name}
                            </Text>
                            <View
                              style={{
                                backgroundColor: status.color + "20",
                                borderRadius: 6,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "700",
                                  color: status.color,
                                }}
                              >
                                {status.label}
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={{
                              fontSize: 12,
                              color: C.mutedBrown,
                              marginBottom: 4,
                            }}
                          >
                            Given: {formatDate(vax.dateGiven)}
                          </Text>

                          {vax.dueDate && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Due: {formatDate(vax.dueDate)}
                            </Text>
                          )}

                          {vax.vetClinic && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              {vax.vetClinic}
                            </Text>
                          )}

                          {vax.notes && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                fontStyle: "italic",
                                marginTop: 6,
                              }}
                            >
                              {vax.notes}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  !showAddForm && (
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        textAlign: "center",
                        paddingVertical: 40,
                      }}
                    >
                      No vaccines added yet
                    </Text>
                  )
                )}
              </View>
            )}

            {/* PREVENTIVES TAB */}
            {activeTab === "preventives" && (
              <View>
                {/* Add Button */}
                {!showAddForm && (
                  <TouchableOpacity
                    onPress={() => setShowAddForm(true)}
                    style={{
                      backgroundColor: C.coral,
                      borderRadius: 14,
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 20,
                    }}
                  >
                    <Plus size={20} color="#FFF" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: "#FFF",
                      }}
                    >
                      Add preventive care
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Add Form */}
                {showAddForm && (
                  <View
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.coral,
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: C.warmBrown,
                        marginBottom: 14,
                      }}
                    >
                      Add preventive care
                    </Text>

                    <View style={{ gap: 12 }}>
                      <View>
                        <Text style={styles.label}>Product name *</Text>
                        <TextInput
                          value={prevProductName}
                          onChangeText={setPrevProductName}
                          placeholder="e.g., Simparica Trio"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Type</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          style={{ marginTop: 8 }}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {PREVENTIVE_TYPES.map((type) => (
                            <TouchableOpacity
                              key={type.key}
                              onPress={() => setPrevType(type.key)}
                              style={{
                                backgroundColor:
                                  prevType === type.key ? C.coral : C.sand,
                                borderRadius: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Text style={{ fontSize: 14 }}>{type.emoji}</Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color:
                                    prevType === type.key
                                      ? "#FFF"
                                      : C.warmBrown,
                                }}
                              >
                                {type.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      <View>
                        <Text style={styles.label}>Frequency</Text>
                        <TextInput
                          value={prevFrequency}
                          onChangeText={setPrevFrequency}
                          placeholder="e.g., Monthly, Every 3 months"
                          placeholderTextColor={C.mutedBrown + "80"}
                          style={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Last given</Text>
                        <DateField
                          value={prevLastGiven}
                          onChange={setPrevLastGiven}
                          fieldStyle={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Next due</Text>
                        <DateField
                          value={prevNextDue}
                          onChange={setPrevNextDue}
                          fieldStyle={styles.input}
                        />
                      </View>

                      <View>
                        <Text style={styles.label}>Notes</Text>
                        <TextInput
                          value={prevNotes}
                          onChangeText={setPrevNotes}
                          placeholder="Any additional notes..."
                          placeholderTextColor={C.mutedBrown + "80"}
                          multiline
                          numberOfLines={3}
                          style={[
                            styles.input,
                            { minHeight: 80, textAlignVertical: "top" },
                          ]}
                        />
                      </View>

                      <TouchableOpacity
                        onPress={() =>
                          setPrevReminderEnabled(!prevReminderEnabled)
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          backgroundColor: C.sand,
                          borderRadius: 10,
                        }}
                      >
                        {prevReminderEnabled ? (
                          <Bell size={18} color={C.sage} />
                        ) : (
                          <BellOff size={18} color={C.mutedBrown} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: C.warmBrown,
                            flex: 1,
                          }}
                        >
                          Enable reminder
                        </Text>
                        {prevReminderEnabled && (
                          <CheckCircle size={18} color={C.sage} />
                        )}
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 16,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setShowAddForm(false)}
                        style={{
                          flex: 1,
                          backgroundColor: C.sand,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: C.warmBrown,
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleAddPreventive}
                        style={{
                          flex: 1,
                          backgroundColor: C.coral,
                          borderRadius: 12,
                          padding: 14,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "700",
                            color: "#FFF",
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Preventives List */}
                {preventives.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {preventives.map((prev) => {
                      const status = getPreventiveStatus(prev);
                      return (
                        <View
                          key={prev.id}
                          style={{
                            backgroundColor: C.card,
                            borderRadius: 12,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.peach,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 15,
                                  fontWeight: "800",
                                  color: C.warmBrown,
                                  marginBottom: 4,
                                }}
                              >
                                {prev.productName}
                              </Text>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Text style={{ fontSize: 14 }}>
                                  {getPreventiveTypeEmoji(prev.type)}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: C.mutedBrown,
                                  }}
                                >
                                  {getPreventiveTypeLabel(prev.type)}
                                </Text>
                              </View>
                            </View>
                            <View
                              style={{
                                backgroundColor: status.color + "20",
                                borderRadius: 6,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "700",
                                  color: status.color,
                                }}
                              >
                                {status.label}
                              </Text>
                            </View>
                          </View>

                          {prev.frequency && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Frequency: {prev.frequency}
                            </Text>
                          )}

                          {prev.lastGiven && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Last given: {formatDate(prev.lastGiven)}
                            </Text>
                          )}

                          {prev.nextDue && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                marginBottom: 4,
                              }}
                            >
                              Next due: {formatDate(prev.nextDue)}
                            </Text>
                          )}

                          {prev.notes && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.mutedBrown,
                                fontStyle: "italic",
                                marginTop: 6,
                              }}
                            >
                              {prev.notes}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  !showAddForm && (
                    <Text
                      style={{
                        fontSize: 14,
                        color: C.mutedBrown,
                        textAlign: "center",
                        paddingVertical: 40,
                      }}
                    >
                      No preventive care added yet
                    </Text>
                  )
                )}
              </View>
            )}
          </KeyboardAwareScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = {
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: C.warmBrown,
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.sand,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
  },
};
