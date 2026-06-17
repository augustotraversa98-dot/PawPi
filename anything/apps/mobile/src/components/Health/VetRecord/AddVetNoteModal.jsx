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
import { COLORS as C } from "@/constants/colors";
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
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: C.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <TouchableOpacity onPress={close} accessibilityLabel="Close">
            <X size={22} color={C.mutedBrown} />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}>
            Add to history
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.mutedBrown, marginBottom: 8 }}>
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
              borderColor: noteDate ? C.coral : C.sand,
            }}
          />

          <Text style={{ fontSize: 13, fontWeight: "700", color: C.mutedBrown, marginTop: 20, marginBottom: 8 }}>
            Note
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What happened? (symptoms, visit summary, questions for the vet…)"
            placeholderTextColor={C.mutedBrown}
            multiline
            style={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              fontSize: 15,
              color: C.warmBrown,
              minHeight: 120,
              textAlignVertical: "top",
              borderWidth: 2,
              borderColor: note ? C.coral : C.sand,
            }}
          />

          <Text style={{ fontSize: 11, color: C.mutedBrown, marginTop: 12, lineHeight: 16 }}>
            History is append-only: entries are kept with their date. Vets can add
            entries but can't edit or delete them — only you can.
          </Text>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            style={{
              marginTop: 24,
              backgroundColor: canSave ? C.coral : C.sand,
              borderRadius: 16,
              height: 54,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Plus size={18} color={canSave ? "#FFF" : C.mutedBrown} />
                <Text style={{ color: canSave ? "#FFF" : C.mutedBrown, fontWeight: "800", fontSize: 16 }}>
                  Add entry
                </Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export default AddVetNoteModal;
