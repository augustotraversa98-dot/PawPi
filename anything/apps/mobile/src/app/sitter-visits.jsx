import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart, PlusCircle, X } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  useMyProviders,
  useProviderBookings,
  useMySittingVisits,
  useLogSittingVisit,
} from "@/hooks/useProviders";

// SITTER workspace (ticket 2.9) — a provider's active sitter-staff log per-visit UPDATES
// for booked sitting jobs (notes + photos the owner reads). MIRRORS the walker workspace
// (walker-walks.jsx): list the sitter's bookings + their already-logged visits, and post a
// new visit via a lightweight modal. The backend gates capability('sitter') +
// assertCareAccess('health_logs_write') and assigns each visit to the calling sitter
// (sitting_visits RLS — participant-scoped). No fake data; empty → empty states.
export default function SitterVisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: providers, isLoading } = useMyProviders();
  // The first provider the sitter works for (most sitters are staff of one business).
  const provider = (providers ?? [])[0] ?? null;
  const { data: bookings, refetch } = useProviderBookings(provider?.id);
  const sitterBookings = (bookings ?? []).filter(
    (b) => b.capability === "sitter" && b.booking_status !== "cancelled",
  );
  const { data: visits, refetch: refetchVisits } = useMySittingVisits(provider?.id);

  const [logFor, setLogFor] = useState(null); // the booking being logged against

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Sitting Visits 💛
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            {provider ? provider.name : "Your assigned sitting jobs"}
          </Text>
        </View>
      </View>

      <RefreshableScrollView
        refetch={() => {
          refetch();
          refetchVisits();
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : !provider ? (
          <EmptyState
            title="No sitter workspace"
            body="You're not active staff of a pet-sitting provider yet."
          />
        ) : sitterBookings.length === 0 ? (
          <EmptyState
            title="No sitting jobs booked"
            body="Booked sitting jobs from owners will appear here to log visits."
          />
        ) : (
          sitterBookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              visitCount={
                (visits ?? []).filter((v) => v.booking_id === b.id).length
              }
              onLog={() => setLogFor(b)}
            />
          ))
        )}
      </RefreshableScrollView>

      <LogVisitModal
        booking={logFor}
        providerId={provider?.id}
        onClose={() => setLogFor(null)}
        onLogged={() => {
          refetchVisits();
        }}
      />
    </View>
  );
}

function BookingCard({ booking, visitCount, onLog }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
            {booking.pet_name || "Dog"}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
            {booking.owner_name ? `${booking.owner_name} · ` : ""}
            {booking.title}
          </Text>
          {visitCount > 0 ? (
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 4 }}>
              {visitCount} visit{visitCount > 1 ? "s" : ""} logged
            </Text>
          ) : null}
          {booking.meet_and_greet ? (
            <Text style={{ fontSize: 12, color: COLORS.coral, fontWeight: "700", marginTop: 4 }}>
              Meet & greet
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onLog}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: 14,
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <PlusCircle size={16} color="#FFF" />
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>
            Log visit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Log a per-visit update for a booking: a note (+ a photo URL field reusing the existing
// upload path is added in the real upload flow; here we accept already-uploaded URLs). The
// backend assigns the visit to the calling sitter + owner-derives from the pet.
function LogVisitModal({ booking, providerId, onClose, onLogged }) {
  const [notes, setNotes] = useState("");
  const log = useLogSittingVisit();

  const reset = () => setNotes("");

  const submit = async () => {
    if (!notes.trim()) {
      Alert.alert("Add a note", "Write a short update for the owner.");
      return;
    }
    try {
      await log.mutateAsync({
        providerId,
        pet_id: booking.pet_id,
        booking_id: booking.id,
        status: "completed",
        notes: notes.trim(),
      });
      Alert.alert("Visit logged", "The owner will see your update.");
      reset();
      onClose();
      onLogged?.();
    } catch (e) {
      Alert.alert("Couldn't log visit", e.message || "Please try again.");
    }
  };

  return (
    <Modal
      visible={!!booking}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
            backgroundColor: COLORS.card,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}>
            Log a visit
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
          {booking ? (
            <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginBottom: 16 }}>
              {booking.pet_name || "Dog"}
              {booking.owner_name ? ` · ${booking.owner_name}` : ""}
            </Text>
          ) : null}

          <FieldLabel>Update for the owner</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Fed, played, and a short walk — happy pup!"
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <TouchableOpacity
            onPress={submit}
            disabled={log.isPending}
            activeOpacity={0.9}
            style={{
              marginTop: 24,
              backgroundColor: COLORS.coral,
              borderRadius: 16,
              paddingVertical: 15,
              alignItems: "center",
              opacity: log.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
              {log.isPending ? "Logging…" : "Post update"}
            </Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.peach,
  padding: 12,
  fontSize: 14,
  color: COLORS.warmBrown,
  minHeight: 80,
  textAlignVertical: "top",
};

function FieldLabel({ children, style }) {
  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: "700", color: COLORS.warmBrown, marginBottom: 6 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Heart size={32} color={COLORS.mutedBrown} />
      <Text
        style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
