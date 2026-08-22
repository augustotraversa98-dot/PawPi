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
  ActivityIndicator,
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
  Info,
  Bell,
  BellOff,
  Trash2,
  Pencil,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  PREVENTIVE_TYPES,
  formatDate,
  getVaccineStatus,
  getPreventiveStatus,
  getPreventiveTypeEmoji,
} from "@/data/medicationData";
import {
  usePetMedications,
  useCreateMedication,
  useUpdateMedication,
  useDeleteMedication,
} from "@/hooks/usePetMedications";
import {
  usePetVaccinations,
  useCreateVaccination,
  useUpdateVaccination,
  useDeleteVaccination,
} from "@/hooks/usePetVaccinations";
import {
  usePetPreventiveTreatments,
  useCreatePreventiveTreatment,
  useUpdatePreventiveTreatment,
  useDeletePreventiveTreatment,
} from "@/hooks/usePetPreventiveTreatments";
import DateField from "@/components/DateField";

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

const styles = {
  label: { fontSize: 13, fontWeight: "700", color: C.warmBrown, marginBottom: 6 },
  input: {
    backgroundColor: C.sand,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
  },
  empty: {
    fontSize: 14,
    color: C.mutedBrown,
    textAlign: "center",
    paddingVertical: 40,
  },
  rowLine: { fontSize: 13, color: C.mutedBrown, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.warmBrown, marginBottom: 6 },
};

// Module-scope presentational pieces — stable identity so TextInputs never lose focus.
function Field({ label, children }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ multiline, style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={C.mutedBrown + "80"}
      multiline={multiline}
      numberOfLines={multiline ? 3 : undefined}
      style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }, style]}
      {...props}
    />
  );
}

function ReminderToggle({ enabled, onToggle, label }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        backgroundColor: C.sand,
        borderRadius: 10,
      }}
    >
      {enabled ? <Bell size={18} color={C.sage} /> : <BellOff size={18} color={C.mutedBrown} />}
      <Text style={{ fontSize: 14, fontWeight: "600", color: C.warmBrown, flex: 1 }}>{label}</Text>
      {enabled && <CheckCircle size={18} color={C.sage} />}
    </TouchableOpacity>
  );
}

function StatusBadge({ color, label }) {
  return (
    <View style={{ backgroundColor: color + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
    </View>
  );
}

function RowActions({ onEdit, onDelete, editLabel, deleteLabel }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
      <TouchableOpacity
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={editLabel}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: C.sand,
          borderRadius: 8,
          padding: 10,
        }}
      >
        <Pencil size={15} color={C.terracotta} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.terracotta }}>{editLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: "#FFEBEE",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <Trash2 size={15} color="#E57373" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#E57373" }}>{deleteLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const canonical = (v) => (v ? String(v).slice(0, 10) : "");

export default function MedicationModal({
  visible,
  onClose,
  initialTab = "medications",
  petId,
}) {
  const { t } = useTranslation();
  const tc = (k, vars) => t(`health.medications.${k}`, vars);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Data — real, per pet, owner-scoped (empty states until something is added; no seed).
  const medsQuery = usePetMedications(petId);
  const vaxQuery = usePetVaccinations(petId);
  const prevQuery = usePetPreventiveTreatments(petId);
  const medications = medsQuery.data || [];
  const vaccines = vaxQuery.data || [];
  const preventives = prevQuery.data || [];
  const currentMeds = medications.filter((m) => m.status !== "completed");
  const pastMeds = medications.filter((m) => m.status === "completed");

  // Mutations
  const createMed = useCreateMedication(petId);
  const updateMed = useUpdateMedication(petId);
  const deleteMed = useDeleteMedication(petId);
  const createVax = useCreateVaccination(petId);
  const updateVax = useUpdateVaccination(petId);
  const deleteVax = useDeleteVaccination(petId);
  const createPrev = useCreatePreventiveTreatment(petId);
  const updatePrev = useUpdatePreventiveTreatment(petId);
  const deletePrev = useDeletePreventiveTreatment(petId);

  // Form state (shared per tab; also used for edit prefill)
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medFrequency, setMedFrequency] = useState("");
  const [medPrescribedBy, setMedPrescribedBy] = useState("");
  const [medNotes, setMedNotes] = useState("");
  const [medReminderEnabled, setMedReminderEnabled] = useState(false);

  const [vaxName, setVaxName] = useState("");
  const [vaxDateGiven, setVaxDateGiven] = useState("");
  const [vaxDueDate, setVaxDueDate] = useState("");
  const [vaxClinic, setVaxClinic] = useState("");
  const [vaxNotes, setVaxNotes] = useState("");
  const [vaxReminderEnabled, setVaxReminderEnabled] = useState(false);

  const [prevProductName, setPrevProductName] = useState("");
  const [prevType, setPrevType] = useState("");
  const [prevFrequency, setPrevFrequency] = useState("");
  const [prevLastGiven, setPrevLastGiven] = useState("");
  const [prevNextDue, setPrevNextDue] = useState("");
  const [prevNotes, setPrevNotes] = useState("");
  const [prevReminderEnabled, setPrevReminderEnabled] = useState(false);

  const resetMedForm = () => {
    setMedName(""); setMedDose(""); setMedFrequency(""); setMedPrescribedBy("");
    setMedNotes(""); setMedReminderEnabled(false);
  };
  const resetVaxForm = () => {
    setVaxName(""); setVaxDateGiven(""); setVaxDueDate(""); setVaxClinic("");
    setVaxNotes(""); setVaxReminderEnabled(false);
  };
  const resetPrevForm = () => {
    setPrevProductName(""); setPrevType(""); setPrevFrequency(""); setPrevLastGiven("");
    setPrevNextDue(""); setPrevNotes(""); setPrevReminderEnabled(false);
  };
  const resetActiveForm = () => {
    if (activeTab === "medications") resetMedForm();
    else if (activeTab === "vaccines") resetVaxForm();
    else resetPrevForm();
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    resetActiveForm();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    closeForm();
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  const openAdd = () => {
    setEditingId(null);
    resetActiveForm();
    setShowAddForm(true);
  };

  // ── Medications ────────────────────────────────────────────────────────────────
  const editMedication = (med) => {
    setMedName(med.name || "");
    setMedDose(med.dose || "");
    setMedFrequency(med.frequency || "");
    setMedPrescribedBy(med.prescribed_by || "");
    setMedNotes(med.notes || "");
    setMedReminderEnabled(!!med.reminder_enabled);
    setEditingId(med.id);
    setShowAddForm(true);
  };

  const saveMedication = async () => {
    if (!medName.trim()) {
      Alert.alert(tc("required"), tc("nameRequired"));
      return;
    }
    const payload = {
      name: medName.trim(),
      dose: medDose,
      frequency: medFrequency,
      prescribedBy: medPrescribedBy,
      notes: medNotes,
      reminderEnabled: medReminderEnabled,
    };
    try {
      if (editingId) await updateMed.mutateAsync({ id: editingId, ...payload });
      else await createMed.mutateAsync(payload);
      closeForm();
    } catch (e) {
      Alert.alert(tc("required"), e?.message || "Error");
    }
  };

  const completeMedication = (med) => {
    Alert.alert(tc("markCompletedTitle"), tc("markCompletedBody", { name: med.name }), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: tc("markCompleted"),
        onPress: () => updateMed.mutate({ id: med.id, status: "completed" }),
      },
    ]);
  };

  // ── Vaccines ───────────────────────────────────────────────────────────────────
  const editVaccine = (vax) => {
    setVaxName(vax.name || "");
    setVaxDateGiven(canonical(vax.date_given));
    setVaxDueDate(canonical(vax.expires_on));
    setVaxClinic(vax.clinic_name || "");
    setVaxNotes(vax.notes || "");
    setVaxReminderEnabled(!!vax.reminder_enabled);
    setEditingId(vax.id);
    setShowAddForm(true);
  };

  const saveVaccine = async () => {
    if (!vaxName.trim()) {
      Alert.alert(tc("required"), tc("nameRequired"));
      return;
    }
    const payload = {
      name: vaxName.trim(),
      dateGiven: vaxDateGiven || null,
      expiresOn: vaxDueDate || null,
      clinicName: vaxClinic,
      notes: vaxNotes,
      reminderEnabled: vaxReminderEnabled,
    };
    try {
      if (editingId) await updateVax.mutateAsync({ id: editingId, ...payload });
      else await createVax.mutateAsync(payload);
      closeForm();
    } catch (e) {
      Alert.alert(tc("required"), e?.message || "Error");
    }
  };

  // ── Preventives ─────────────────────────────────────────────────────────────────
  const editPreventive = (prev) => {
    setPrevProductName(prev.product_name || "");
    setPrevType(prev.treatment_type || "");
    setPrevFrequency(prev.frequency || "");
    setPrevLastGiven(canonical(prev.last_given));
    setPrevNextDue(canonical(prev.next_due));
    setPrevNotes(prev.notes || "");
    setPrevReminderEnabled(!!prev.reminder_enabled);
    setEditingId(prev.id);
    setShowAddForm(true);
  };

  const savePreventive = async () => {
    if (!prevProductName.trim()) {
      Alert.alert(tc("required"), tc("productRequired"));
      return;
    }
    const payload = {
      productName: prevProductName.trim(),
      treatmentType: prevType || "other",
      frequency: prevFrequency,
      lastGiven: prevLastGiven || null,
      nextDue: prevNextDue || null,
      notes: prevNotes,
      reminderEnabled: prevReminderEnabled,
    };
    try {
      if (editingId) await updatePrev.mutateAsync({ id: editingId, ...payload });
      else await createPrev.mutateAsync(payload);
      closeForm();
    } catch (e) {
      Alert.alert(tc("required"), e?.message || "Error");
    }
  };

  const confirmDelete = (name, onConfirm) => {
    Alert.alert(tc("deleteTitle", { name }), tc("deleteBody"), [
      { text: tc("cancel"), style: "cancel" },
      { text: tc("delete"), style: "destructive", onPress: onConfirm },
    ]);
  };

  const addButton = (label) => (
    <TouchableOpacity
      onPress={openAdd}
      accessibilityRole="button"
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
      <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>{label}</Text>
    </TouchableOpacity>
  );

  const formActions = (onSave, pending) => (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
      <TouchableOpacity
        onPress={closeForm}
        style={{ flex: 1, backgroundColor: C.sand, borderRadius: 12, padding: 14, alignItems: "center" }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown }}>{tc("cancel")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSave}
        disabled={pending}
        style={{ flex: 1, backgroundColor: pending ? C.mutedBrown + "60" : C.coral, borderRadius: 12, padding: 14, alignItems: "center" }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>{tc("save")}</Text>
      </TouchableOpacity>
    </View>
  );

  const formCard = (title, children) => (
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
      <Text style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown, marginBottom: 14 }}>{title}</Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );

  const TABS = [
    { key: "medications", label: tc("tabMedications"), Icon: Pill },
    { key: "vaccines", label: tc("tabVaccines"), Icon: Syringe },
    { key: "preventives", label: tc("tabPreventives"), Icon: Shield },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 20,
            // DEFINITE height (not maxHeight-only): the middle child is a flex:1
            // KeyboardAwareScrollView, which collapses to 0 height under a content-sized
            // parent — the same zero-height sheet bug fixed for Quick Check (#436).
            height: "90%",
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
            <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>{tc("title")}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tc("cancel")}>
              <X size={24} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 16 }}>
            {TABS.map(({ key, label, Icon }) => {
              const active = activeTab === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleTabChange(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    backgroundColor: active ? C.coral : C.card,
                    borderRadius: 12,
                    padding: 12,
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: active ? C.coral : C.peach,
                  }}
                >
                  <Icon size={18} color={active ? "#FFF" : C.warmBrown} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: active ? "#FFF" : C.warmBrown,
                      marginTop: 4,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
                  <Text style={{ fontSize: 12, color: C.mutedBrown, lineHeight: 17, flex: 1 }}>
                    {tc("medsSafety")}
                  </Text>
                </View>

                {!showAddForm && addButton(tc("addMedication"))}

                {showAddForm &&
                  formCard(editingId ? tc("editMedication") : tc("newMedication"), (
                    <>
                      <Field label={`${tc("fieldName")} *`}>
                        <Input value={medName} onChangeText={setMedName} placeholder={tc("phMedName")} />
                      </Field>
                      <Field label={tc("fieldDose")}>
                        <Input value={medDose} onChangeText={setMedDose} placeholder={tc("phDose")} />
                      </Field>
                      <Field label={tc("fieldFrequency")}>
                        <Input value={medFrequency} onChangeText={setMedFrequency} placeholder={tc("phFrequency")} />
                      </Field>
                      <Field label={tc("fieldPrescribedBy")}>
                        <Input value={medPrescribedBy} onChangeText={setMedPrescribedBy} placeholder={tc("phPrescribedBy")} />
                      </Field>
                      <Field label={tc("fieldNotes")}>
                        <Input value={medNotes} onChangeText={setMedNotes} placeholder={tc("phNotes")} multiline />
                      </Field>
                      <ReminderToggle
                        enabled={medReminderEnabled}
                        onToggle={() => setMedReminderEnabled((v) => !v)}
                        label={tc("fieldEnableReminders")}
                      />
                      {formActions(saveMedication, createMed.isPending || updateMed.isPending)}
                    </>
                  ))}

                {medsQuery.isLoading ? (
                  <ActivityIndicator color={C.coral} style={{ marginVertical: 24 }} />
                ) : (
                  <>
                    {currentMeds.length > 0 && (
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown, marginBottom: 12 }}>
                          {tc("currentMedications")}
                        </Text>
                        <View style={{ gap: 10 }}>
                          {currentMeds.map((med) => (
                            <View
                              key={med.id}
                              style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.peach }}
                            >
                              <Text style={styles.cardTitle}>{med.name}</Text>
                              {med.dose ? <Text style={styles.rowLine}>{tc("labelDose")}: {med.dose}</Text> : null}
                              {med.frequency ? <Text style={styles.rowLine}>{tc("labelFrequency")}: {med.frequency}</Text> : null}
                              {med.prescribed_by ? <Text style={styles.rowLine}>{tc("labelPrescribedBy")}: {med.prescribed_by}</Text> : null}
                              {med.notes ? <Text style={{ ...styles.rowLine, fontStyle: "italic", marginTop: 4 }}>{med.notes}</Text> : null}
                              <TouchableOpacity
                                onPress={() => completeMedication(med)}
                                accessibilityRole="button"
                                style={{ marginTop: 10, backgroundColor: C.sage + "20", borderRadius: 8, padding: 10, alignItems: "center" }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: "700", color: C.sage }}>{tc("markCompleted")}</Text>
                              </TouchableOpacity>
                              <RowActions
                                onEdit={() => editMedication(med)}
                                onDelete={() => confirmDelete(med.name, () => deleteMed.mutate(med.id))}
                                editLabel={tc("edit")}
                                deleteLabel={tc("delete")}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {pastMeds.length > 0 && (
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown, marginBottom: 12 }}>
                          {tc("pastMedications")}
                        </Text>
                        <View style={{ gap: 10 }}>
                          {pastMeds.map((med) => (
                            <View
                              key={med.id}
                              style={{ backgroundColor: C.sand + "80", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.peach + "60", opacity: 0.8 }}
                            >
                              <Text style={styles.cardTitle}>{med.name}</Text>
                              {(med.start_date || med.end_date) ? (
                                <Text style={styles.rowLine}>
                                  {formatDate(med.start_date)}
                                  {med.end_date ? ` – ${formatDate(med.end_date)}` : ""}
                                </Text>
                              ) : null}
                              {med.notes ? <Text style={{ ...styles.rowLine, fontStyle: "italic", marginTop: 4 }}>{med.notes}</Text> : null}
                              <RowActions
                                onEdit={() => editMedication(med)}
                                onDelete={() => confirmDelete(med.name, () => deleteMed.mutate(med.id))}
                                editLabel={tc("edit")}
                                deleteLabel={tc("delete")}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {currentMeds.length === 0 && pastMeds.length === 0 && !showAddForm && (
                      <Text style={styles.empty}>{tc("emptyMeds")}</Text>
                    )}
                  </>
                )}
              </View>
            )}

            {/* VACCINES TAB */}
            {activeTab === "vaccines" && (
              <View>
                {!showAddForm && addButton(tc("addVaccine"))}

                {showAddForm &&
                  formCard(editingId ? tc("editVaccine") : tc("newVaccine"), (
                    <>
                      <Field label={`${tc("fieldVaxName")} *`}>
                        <Input value={vaxName} onChangeText={setVaxName} placeholder={tc("phVaxName")} />
                      </Field>
                      <Field label={tc("fieldDateGiven")}>
                        <DateField value={vaxDateGiven} onChange={setVaxDateGiven} fieldStyle={styles.input} />
                      </Field>
                      <Field label={tc("fieldExpiration")}>
                        <DateField value={vaxDueDate} onChange={setVaxDueDate} fieldStyle={styles.input} />
                      </Field>
                      <Field label={tc("fieldClinic")}>
                        <Input value={vaxClinic} onChangeText={setVaxClinic} placeholder={tc("phClinic")} />
                      </Field>
                      <Field label={tc("fieldNotes")}>
                        <Input value={vaxNotes} onChangeText={setVaxNotes} placeholder={tc("phNotes")} multiline />
                      </Field>
                      <ReminderToggle
                        enabled={vaxReminderEnabled}
                        onToggle={() => setVaxReminderEnabled((v) => !v)}
                        label={tc("fieldEnableReminders")}
                      />
                      {formActions(saveVaccine, createVax.isPending || updateVax.isPending)}
                    </>
                  ))}

                {vaxQuery.isLoading ? (
                  <ActivityIndicator color={C.coral} style={{ marginVertical: 24 }} />
                ) : vaccines.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {vaccines.map((vax) => {
                      const status = getVaccineStatus(vax.expires_on);
                      return (
                        <View key={vax.id} style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.peach }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                            <Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0 }}>{vax.name}</Text>
                            <StatusBadge color={status.color} label={tc(`status${status.key.charAt(0).toUpperCase()}${status.key.slice(1)}`)} />
                          </View>
                          {vax.date_given ? <Text style={styles.rowLine}>{tc("labelGiven")}: {formatDate(vax.date_given)}</Text> : null}
                          {vax.expires_on ? <Text style={styles.rowLine}>{tc("labelDue")}: {formatDate(vax.expires_on)}</Text> : null}
                          {vax.clinic_name ? <Text style={styles.rowLine}>{vax.clinic_name}</Text> : null}
                          {vax.notes ? <Text style={{ ...styles.rowLine, fontStyle: "italic", marginTop: 4 }}>{vax.notes}</Text> : null}
                          <RowActions
                            onEdit={() => editVaccine(vax)}
                            onDelete={() => confirmDelete(vax.name, () => deleteVax.mutate(vax.id))}
                            editLabel={tc("edit")}
                            deleteLabel={tc("delete")}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  !showAddForm && <Text style={styles.empty}>{tc("emptyVaccines")}</Text>
                )}
              </View>
            )}

            {/* PREVENTIVES TAB */}
            {activeTab === "preventives" && (
              <View>
                {!showAddForm && addButton(tc("addPreventive"))}

                {showAddForm &&
                  formCard(editingId ? tc("editPreventive") : tc("newPreventive"), (
                    <>
                      <Field label={`${tc("fieldProductName")} *`}>
                        <Input value={prevProductName} onChangeText={setPrevProductName} placeholder={tc("phProductName")} />
                      </Field>
                      <Field label={tc("fieldType")}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          style={{ marginTop: 8 }}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {PREVENTIVE_TYPES.map((type) => {
                            const sel = prevType === type.key;
                            return (
                              <TouchableOpacity
                                key={type.key}
                                onPress={() => setPrevType(type.key)}
                                style={{
                                  backgroundColor: sel ? C.coral : C.sand,
                                  borderRadius: 10,
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Text style={{ fontSize: 14 }}>{type.emoji}</Text>
                                <Text style={{ fontSize: 12, fontWeight: "600", color: sel ? "#FFF" : C.warmBrown }}>
                                  {tc(`prevTypes.${type.key}`)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </Field>
                      <Field label={tc("fieldFrequency")}>
                        <Input value={prevFrequency} onChangeText={setPrevFrequency} placeholder={tc("phPrevFrequency")} />
                      </Field>
                      <Field label={tc("fieldLastGiven")}>
                        <DateField value={prevLastGiven} onChange={setPrevLastGiven} fieldStyle={styles.input} />
                      </Field>
                      <Field label={tc("fieldNextDue")}>
                        <DateField value={prevNextDue} onChange={setPrevNextDue} fieldStyle={styles.input} />
                      </Field>
                      <Field label={tc("fieldNotes")}>
                        <Input value={prevNotes} onChangeText={setPrevNotes} placeholder={tc("phNotes")} multiline />
                      </Field>
                      <ReminderToggle
                        enabled={prevReminderEnabled}
                        onToggle={() => setPrevReminderEnabled((v) => !v)}
                        label={tc("fieldEnableReminders")}
                      />
                      {formActions(savePreventive, createPrev.isPending || updatePrev.isPending)}
                    </>
                  ))}

                {prevQuery.isLoading ? (
                  <ActivityIndicator color={C.coral} style={{ marginVertical: 24 }} />
                ) : preventives.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {preventives.map((prev) => {
                      const status = getPreventiveStatus(prev.next_due);
                      return (
                        <View key={prev.id} style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.peach }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ ...styles.cardTitle, marginBottom: 4 }}>{prev.product_name}</Text>
                              {prev.treatment_type ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <Text style={{ fontSize: 14 }}>{getPreventiveTypeEmoji(prev.treatment_type)}</Text>
                                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>{tc(`prevTypes.${prev.treatment_type}`)}</Text>
                                </View>
                              ) : null}
                            </View>
                            <StatusBadge color={status.color} label={tc(`status${status.key.charAt(0).toUpperCase()}${status.key.slice(1)}`)} />
                          </View>
                          {prev.frequency ? <Text style={styles.rowLine}>{tc("labelFrequency")}: {prev.frequency}</Text> : null}
                          {prev.last_given ? <Text style={styles.rowLine}>{tc("labelLastGiven")}: {formatDate(prev.last_given)}</Text> : null}
                          {prev.next_due ? <Text style={styles.rowLine}>{tc("labelNextDue")}: {formatDate(prev.next_due)}</Text> : null}
                          {prev.notes ? <Text style={{ ...styles.rowLine, fontStyle: "italic", marginTop: 4 }}>{prev.notes}</Text> : null}
                          <RowActions
                            onEdit={() => editPreventive(prev)}
                            onDelete={() => confirmDelete(prev.product_name, () => deletePrev.mutate(prev.id))}
                            editLabel={tc("edit")}
                            deleteLabel={tc("delete")}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  !showAddForm && <Text style={styles.empty}>{tc("emptyPreventives")}</Text>
                )}
              </View>
            )}
          </KeyboardAwareScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
