import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Globe, Lock, Check, X, Search } from "lucide-react-native";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import WalkMapPicker from "@/components/SocialWalks/WalkMapPicker";
import { useCreateSocialWalk } from "@/hooks/useSocialWalks";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useSearch, useDebouncedValue } from "@/hooks/useSearch";
import { visibilityForToggle, isValidCoord } from "@/utils/walkBuddies";

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

function combineDateTime(dateStr, timeStr) {
  // canonical "YYYY-MM-DD" + "HH:MM" → local Date → ISO. Returns null if incomplete.
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

export default function CreateWalkPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const createMutation = useCreateSocialWalk();

  const [walkName, setWalkName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [coord, setCoord] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [notes, setNotes] = useState("");

  // Invitee picker (private only) — reuses owner search (2.25).
  const [inviteQuery, setInviteQuery] = useState("");
  const debouncedQuery = useDebouncedValue(inviteQuery, 300);
  const { data: searchResults, isFetching: searching } = useSearch(debouncedQuery);
  const [invitees, setInvitees] = useState([]); // [{ id, username }]

  const scheduledAt = useMemo(() => combineDateTime(date, time), [date, time]);
  const hasPin = coord && isValidCoord(coord.lat, coord.lng);
  const canSubmit =
    !!currentPet?.id &&
    walkName.trim().length > 0 &&
    !!scheduledAt &&
    (isPublic ? hasPin : true) &&
    !createMutation.isPending;

  const toggleInvitee = (owner) => {
    setInvitees((prev) =>
      prev.some((i) => i.id === owner.id)
        ? prev.filter((i) => i.id !== owner.id)
        : [...prev, { id: owner.id, username: owner.username }],
    );
  };

  const handleCreate = () => {
    if (!canSubmit) return;
    const visibility = visibilityForToggle(isPublic);
    createMutation.mutate(
      {
        petId: currentPet.id,
        walkName: walkName.trim(),
        scheduledAt,
        visibility,
        lat: hasPin ? coord.lat : null,
        lng: hasPin ? coord.lng : null,
        locationName: locationName.trim() || null,
        meetingArea: locationName.trim() || null,
        notesForGuests: notes.trim() || null,
        inviteUserIds: isPublic ? [] : invitees.map((i) => i.id),
      },
      {
        onSuccess: () => router.back(),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          testID="create-walk-back"
          onPress={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: C.sand,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <ArrowLeft size={18} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          New Walk
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Walk name */}
        <Text style={styles.label}>Walk name</Text>
        <TextInput
          testID="walk-name-input"
          value={walkName}
          onChangeText={setWalkName}
          placeholder="Morning park loop"
          placeholderTextColor={C.mutedBrown + "80"}
          style={styles.input}
        />

        {/* Date + time */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Date</Text>
            <DateField value={date} onChange={setDate} testID="walk-date" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Time</Text>
            <TimeField value={time} onChange={setTime} testID="walk-time" />
          </View>
        </View>

        {/* Public / Private toggle */}
        <Text style={[styles.label, { marginTop: 20 }]}>Who can join?</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            testID="toggle-public"
            onPress={() => setIsPublic(true)}
            style={[styles.toggle, isPublic && styles.toggleActive]}
          >
            <Globe size={16} color={isPublic ? "#FFF" : C.warmBrown} />
            <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="toggle-private"
            onPress={() => setIsPublic(false)}
            style={[styles.toggle, !isPublic && styles.toggleActive]}
          >
            <Lock size={16} color={!isPublic ? "#FFF" : C.warmBrown} />
            <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>
              Private
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 6 }}>
          {isPublic
            ? "Anyone searching for walks nearby can find this."
            : "Only people you invite can see this walk."}
        </Text>

        {/* Map picker */}
        <Text style={[styles.label, { marginTop: 20 }]}>Meeting point</Text>
        <WalkMapPicker coord={coord} onPick={setCoord} />
        <TextInput
          testID="location-name-input"
          value={locationName}
          onChangeText={setLocationName}
          placeholder="Place label (e.g. Dog run, east gate)"
          placeholderTextColor={C.mutedBrown + "80"}
          style={[styles.input, { marginTop: 10 }]}
        />

        {/* Invitees (private only) */}
        {!isPublic && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.label}>Invite people</Text>
            <View style={styles.searchRow}>
              <Search size={16} color={C.mutedBrown} />
              <TextInput
                testID="invite-search-input"
                value={inviteQuery}
                onChangeText={setInviteQuery}
                placeholder="Search by name or @handle"
                placeholderTextColor={C.mutedBrown + "80"}
                style={{ flex: 1, fontSize: 15, color: C.warmBrown }}
              />
              {searching && <ActivityIndicator size="small" color={C.sage} />}
            </View>

            {invitees.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {invitees.map((i) => (
                  <TouchableOpacity
                    key={i.id}
                    testID={`invitee-chip-${i.id}`}
                    onPress={() => toggleInvitee(i)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>@{i.username}</Text>
                    <X size={12} color={C.terracotta} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchResults?.owners?.map((owner) => {
              const selected = invitees.some((i) => i.id === owner.id);
              return (
                <TouchableOpacity
                  key={owner.id}
                  testID={`invite-result-${owner.id}`}
                  onPress={() => toggleInvitee(owner)}
                  style={styles.resultRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                      @{owner.username}
                    </Text>
                    {owner.full_name ? (
                      <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                        {owner.full_name}
                      </Text>
                    ) : null}
                  </View>
                  {selected && <Check size={18} color={C.sage} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Notes */}
        <Text style={[styles.label, { marginTop: 20 }]}>Notes for guests (optional)</Text>
        <TextInput
          testID="walk-notes-input"
          value={notes}
          onChangeText={setNotes}
          placeholder="Bring water, friendly dogs only..."
          placeholderTextColor={C.mutedBrown + "80"}
          multiline
          style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
        />

        {/* Submit */}
        <TouchableOpacity
          testID="create-walk-submit"
          onPress={handleCreate}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? C.coral : C.sand,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: 28,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: canSubmit ? "#FFF" : C.mutedBrown,
              }}
            >
              Create walk
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = {
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: C.warmBrown,
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
  },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  toggleActive: {
    backgroundColor: C.sage,
    borderColor: C.sage,
  },
  toggleText: { fontSize: 15, fontWeight: "700", color: C.warmBrown },
  toggleTextActive: { color: "#FFF" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.peach,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.peach,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: C.terracotta },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.peach,
  },
};
