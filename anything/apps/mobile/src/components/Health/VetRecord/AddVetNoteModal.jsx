import React, { useState } from "react";
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
import { X, Plus } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import DateField from "@/components/DateField";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { getLocalPostDateString } from "@/utils/dateUtils";

// Owner adds a dated entry to the append-only clinical history log (ticket 2.42).
// Owner-authored entries omit vetName → labelled "You". Vets append their own via
// the provider clinical route; neither side can edit/delete older entries (RLS).
export function AddVetNoteModal({ visible, onClose, petId, onSaved }) {
  const insets = useSafeAreaInsets();
  const [noteDate, setNoteDate] = useState(getLocalPostDateString());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNoteDate(getLocalPostDateString());
    setNote("");
  };
  const close = () => {
    reset();
    onClose?.();
  };

  const canSave = note.trim().length > 0 && !!noteDate && !saving;

  const handleSave = async () => {
    if (!canSave || !petId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vet-record/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, noteDate, note: note.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Could not save entry");
      }
      onSaved?.();
      close();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  };

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
          <TouchableOpacity onPress={close} accessibilityLabel="Close">
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
            Add to history
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 8 }}>
            Date
          </Text>
          <DateField
            value={noteDate}
            onChange={setNoteDate}
            maximumDate={new Date()}
            fieldStyle={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              borderWidth: 2,
              borderColor: noteDate ? COLORS.coral : MATERIALS.hairline,
            }}
          />

          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginTop: 20, marginBottom: 8 }}>
            Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What happened? (symptoms, visit summary, questions for the vet…)"
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              fontSize: 15,
              color: COLORS.warmBrown,
              minHeight: 120,
              textAlignVertical: "top",
              borderWidth: 2,
              borderColor: note ? COLORS.coral : MATERIALS.hairline,
            }}
          />

          <Text style={[TYPE.caption, { fontWeight: "500", letterSpacing: 0, color: COLORS.mutedBrown, marginTop: SPACING.md, lineHeight: 16 }]}>
            History is append-only: entries are kept with their date. Vets can add
            entries but can't edit or delete them — only you can.
          </Text>

          <PressableScale
            onPress={handleSave}
            disabled={!canSave}
            style={{
              marginTop: SPACING.xxl,
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
                <Text style={[TYPE.headline, { color: canSave ? "#FFF" : COLORS.mutedBrown, fontWeight: "800" }]}>
                  Add entry
                </Text>
              </>
            )}
          </PressableScale>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export default AddVetNoteModal;
