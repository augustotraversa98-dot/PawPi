import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import DateField from "@/components/DateField";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";

// VR-B: one reusable form for the four Vet Record record types that had no dedicated
// modal — allergy / condition / surgery / lab. Each posts to its existing owner-OR-editor
// route (0120 attribution). Notes, documents, vaccination and medication reuse their own
// modals; this covers the rest so the "Add record" picker has no dead "Soon" stubs.
//
// Field schema per type (keys map 1:1 to the route body). `required` gates the save button.
const TYPE_CONFIG = {
  allergy: {
    titleKey: "addForm.allergyTitle",
    endpoint: "/api/vet-record/allergies",
    fields: [
      { key: "allergen", labelKey: "addForm.fAllergen", type: "text", required: true },
      {
        key: "severity",
        labelKey: "addForm.fSeverity",
        type: "chips",
        options: [
          { value: "Mild", labelKey: "addForm.sevMild" },
          { value: "Moderate", labelKey: "addForm.sevModerate" },
          { value: "Severe", labelKey: "addForm.sevSevere" },
        ],
      },
      { key: "reaction", labelKey: "addForm.fReaction", type: "text" },
      { key: "diagnosedDate", labelKey: "addForm.fDiagnosedDate", type: "date" },
      { key: "notes", labelKey: "addForm.fNotes", type: "textarea" },
    ],
  },
  condition: {
    titleKey: "addForm.conditionTitle",
    endpoint: "/api/vet-record/conditions",
    fields: [
      { key: "condition", labelKey: "addForm.fCondition", type: "text", required: true },
      {
        key: "status",
        labelKey: "addForm.fStatus",
        type: "chips",
        default: "active",
        options: [
          { value: "active", labelKey: "addForm.stActive" },
          { value: "managed", labelKey: "addForm.stManaged" },
          { value: "resolved", labelKey: "addForm.stResolved" },
        ],
      },
      { key: "diagnosedDate", labelKey: "addForm.fDiagnosedDate", type: "date" },
      { key: "notes", labelKey: "addForm.fNotes", type: "textarea" },
    ],
  },
  surgery: {
    titleKey: "addForm.surgeryTitle",
    endpoint: "/api/vet-record/surgeries",
    fields: [
      { key: "procedure", labelKey: "addForm.fProcedure", type: "text", required: true },
      { key: "surgeryDate", labelKey: "addForm.fSurgeryDate", type: "date", required: true },
      { key: "surgeon", labelKey: "addForm.fSurgeon", type: "text" },
      { key: "clinic", labelKey: "addForm.fClinic", type: "text" },
      { key: "notes", labelKey: "addForm.fNotes", type: "textarea" },
    ],
  },
  lab: {
    titleKey: "addForm.labTitle",
    endpoint: "/api/vet-record/lab-results",
    fields: [
      { key: "testName", labelKey: "addForm.fTestName", type: "text", required: true },
      { key: "testDate", labelKey: "addForm.fTestDate", type: "date", required: true },
      { key: "results", labelKey: "addForm.fResults", type: "textarea" },
      { key: "orderedBy", labelKey: "addForm.fOrderedBy", type: "text" },
      { key: "notes", labelKey: "addForm.fNotes", type: "textarea" },
    ],
  },
};

export function AddVetRecordModal({ visible, recordType, onClose, petId, onSaved }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const config = recordType ? TYPE_CONFIG[recordType] : null;

  const initialValues = useMemo(() => {
    const v = {};
    config?.fields.forEach((f) => {
      v[f.key] = f.default || "";
    });
    return v;
  }, [config]);

  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);

  // Re-seed when the record type changes (parent keeps this mounted).
  React.useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const setField = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  const close = () => {
    setValues(initialValues);
    onClose?.();
  };

  const canSave =
    !!config &&
    !saving &&
    config.fields
      .filter((f) => f.required)
      .every((f) => (values[f.key] || "").toString().trim().length > 0);

  const handleSave = async () => {
    if (!canSave || !petId || !config) return;
    setSaving(true);
    try {
      const body = { petId };
      config.fields.forEach((f) => {
        const raw = (values[f.key] ?? "").toString().trim();
        body[f.key] = raw.length > 0 ? raw : null;
      });

      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "save-failed");
      }
      onSaved?.();
      close();
    } catch (error) {
      Alert.alert(
        t("health.vetRecord.errorTitle"),
        t("health.vetRecord.addForm.error"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: MATERIALS.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          <TouchableOpacity onPress={close} accessibilityLabel={t("health.vetRecord.close")}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
            {t(`health.vetRecord.${config.titleKey}`)}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
          {config.fields.map((f) => {
            const label = t(`health.vetRecord.${f.labelKey}`);
            const val = values[f.key] || "";
            return (
              <View key={f.key} style={{ marginBottom: 18 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: COLORS.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  {label}
                  {f.required ? " *" : ""}
                </Text>

                {f.type === "date" && (
                  <DateField
                    value={val}
                    onChange={(d) => setField(f.key, d)}
                    maximumDate={new Date()}
                    fieldStyle={{
                      backgroundColor: "#FFF",
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 2,
                      borderColor: val ? COLORS.coral : MATERIALS.hairline,
                    }}
                  />
                )}

                {f.type === "chips" && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {f.options.map((opt) => {
                      const active = val === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setField(f.key, active ? "" : opt.value)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            borderRadius: 16,
                            backgroundColor: active
                              ? COLORS.coral
                              : MATERIALS.surfaceSunken,
                            borderWidth: 1,
                            borderColor: active ? COLORS.coral : MATERIALS.hairline,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: active ? "#FFF" : COLORS.mutedBrown,
                            }}
                          >
                            {t(`health.vetRecord.${opt.labelKey}`)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {(f.type === "text" || f.type === "textarea") && (
                  <TextInput
                    value={val}
                    onChangeText={(txt) => setField(f.key, txt)}
                    placeholder={label}
                    placeholderTextColor={COLORS.mutedBrown}
                    multiline={f.type === "textarea"}
                    style={{
                      backgroundColor: "#FFF",
                      borderRadius: 14,
                      padding: 14,
                      fontSize: 15,
                      color: COLORS.warmBrown,
                      minHeight: f.type === "textarea" ? 90 : undefined,
                      textAlignVertical: f.type === "textarea" ? "top" : "center",
                      borderWidth: 2,
                      borderColor: val ? COLORS.coral : MATERIALS.hairline,
                    }}
                  />
                )}
              </View>
            );
          })}

          <PressableScale
            onPress={handleSave}
            disabled={!canSave}
            style={{
              marginTop: SPACING.lg,
              backgroundColor: canSave ? COLORS.coral : MATERIALS.surfaceSunken,
              borderRadius: RADIUS.control,
              height: 54,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Plus size={18} color={canSave ? "#FFF" : COLORS.mutedBrown} />
                <Text
                  style={[
                    TYPE.headline,
                    { color: canSave ? "#FFF" : COLORS.mutedBrown, fontWeight: "800" },
                  ]}
                >
                  {t("health.vetRecord.addForm.save")}
                </Text>
              </>
            )}
          </PressableScale>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export default AddVetRecordModal;
