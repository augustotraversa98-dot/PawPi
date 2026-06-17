import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Home,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import DateField from "@/components/DateField";
import {
  useDiscoverProviders,
  useDaycareStays,
  useBookDaycareStay,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";

// Daycare & Boarding discovery + stays (ticket 2.8) — browse PUBLISHED daycare providers
// (real data, no mocks) and manage the active pet's STAYS: book a multi-day stay with
// feeding/med instructions, see the VACCINE status (pass/fail + missing), and read the
// daily REPORT CARDS the facility posts. Discovery is the SHARED
// /api/providers/discover?type=daycare (capability match, ticket 2.1) via the SAME
// useDiscoverProviders hook the vet/grooming/walking screens use — no duplicate endpoint.
export default function DaycareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useDiscoverProviders("daycare");

  const { data: stays } = useDaycareStays(petId);
  const activeStays = (stays ?? []).filter(
    (s) => s.status === "booked" || s.status === "checked_in",
  );
  const pastStays = (stays ?? []).filter(
    (s) => s.status === "checked_out" || s.status === "cancelled",
  );

  const [bookFor, setBookFor] = useState(null); // the provider being booked

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
            Daycare & Boarding 🏠
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Book a stay, get daily report cards
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel="Messages"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MessageSquare size={20} color={COLORS.coral} />
        </TouchableOpacity>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {/* Active stays — booked / checked-in, with vaccine status + report cards. */}
        {activeStays.length > 0 ? (
          <>
            <SectionLabel>YOUR STAYS</SectionLabel>
            {activeStays.map((s) => (
              <StayCard key={s.id} stay={s} petName={currentPet?.name} />
            ))}
          </>
        ) : null}

        <SectionLabel style={{ marginTop: activeStays.length ? 24 : 0 }}>
          DAYCARE NEAR YOU
        </SectionLabel>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load facilities"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No facilities available yet"
            body="Check back soon — daycares are joining PawPi."
          />
        ) : (
          providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onOpen={() =>
                router.push({
                  pathname: "/service/provider",
                  params: { slug: p.slug, capability: "daycare" },
                })
              }
              onBook={() => setBookFor(p)}
            />
          ))
        )}

        {pastStays.length > 0 ? (
          <>
            <SectionLabel style={{ marginTop: 24 }}>PAST STAYS</SectionLabel>
            {pastStays.map((s) => (
              <StayCard key={s.id} stay={s} petName={currentPet?.name} />
            ))}
          </>
        ) : null}
      </RefreshableScrollView>

      <BookStayModal
        provider={bookFor}
        petId={petId}
        onClose={() => setBookFor(null)}
      />
    </View>
  );
}

function StayCard({ stay, petName }) {
  const status = stay.status;
  const vax = stay.vaccine_status;
  const cards = stay.report_cards ?? [];
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
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
          {stay.provider_name || "Stay"}
        </Text>
        <StatusPill status={status} />
      </View>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
        {stay.start_date}
        {stay.end_date && stay.end_date !== stay.start_date
          ? ` → ${stay.end_date}`
          : ""}
        {stay.location_name ? ` · ${stay.location_name}` : ""}
      </Text>

      {/* Vaccine status pass/fail + missing. */}
      {vax ? <VaccineStatus vax={vax} /> : null}

      {stay.feeding_instructions ? (
        <Text style={{ fontSize: 12, color: COLORS.warmBrown, marginTop: 8 }}>
          🍽️ {stay.feeding_instructions}
        </Text>
      ) : null}
      {stay.med_instructions ? (
        <Text style={{ fontSize: 12, color: COLORS.warmBrown, marginTop: 4 }}>
          💊 {stay.med_instructions}
        </Text>
      ) : null}

      {/* Daily report cards from the facility. */}
      {cards.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "800",
              color: COLORS.mutedBrown,
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            REPORT CARDS
          </Text>
          {cards.map((c) => (
            <ReportCard key={c.id} card={c} petName={petName} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ReportCard({ card, petName }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.cream,
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.warmBrown }}>
        {card.date}
      </Text>
      {card.mood ? (
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
          Mood: {card.mood}
        </Text>
      ) : null}
      {card.meals ? (
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
          Meals: {card.meals}
        </Text>
      ) : null}
      {card.activities ? (
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
          Activities: {card.activities}
        </Text>
      ) : null}
      {card.notes ? (
        <Text style={{ fontSize: 12, color: COLORS.warmBrown, marginTop: 4 }}>
          {card.notes}
        </Text>
      ) : null}
      {Array.isArray(card.photo_urls) && card.photo_urls.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {card.photo_urls.map((u) => (
            <Image
              key={u}
              source={{ uri: u }}
              style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: COLORS.sand }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function VaccineStatus({ vax }) {
  if (!vax.required || vax.required.length === 0) return null;
  if (vax.passed) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
        <CheckCircle2 size={16} color="#3FA34D" />
        <Text style={{ fontSize: 12, color: "#3FA34D", fontWeight: "700" }}>
          Vaccinations up to date
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={16} color={COLORS.coral} />
        <Text style={{ fontSize: 12, color: COLORS.coral, fontWeight: "700" }}>
          Missing required vaccines
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
        {vax.missing.join(", ")}
      </Text>
    </View>
  );
}

function StatusPill({ status }) {
  const map = {
    booked: { label: "Booked", color: COLORS.coral },
    checked_in: { label: "Checked in", color: "#3FA34D" },
    checked_out: { label: "Checked out", color: COLORS.mutedBrown },
    cancelled: { label: "Cancelled", color: COLORS.mutedBrown },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View
      style={{
        backgroundColor: s.color + "22",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: s.color }}>
        {s.label}
      </Text>
    </View>
  );
}

function ProviderCard({ provider, onOpen, onBook }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.85}
        style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        {provider.logo_url ? (
          <Image
            source={{ uri: provider.logo_url }}
            style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Home size={24} color={COLORS.coral} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
            />
          </View>
          {provider.bio ? (
            <Text
              style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}
              numberOfLines={2}
            >
              {provider.bio}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBook}
        activeOpacity={0.9}
        style={{
          marginTop: 12,
          backgroundColor: COLORS.coral,
          borderRadius: 14,
          paddingVertical: 11,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>
          Book a stay
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Book a stay: dates + feeding/med instructions. Calls useBookDaycareStay, which the
// backend gates for capacity/overbook (the "fully booked" message surfaces here).
function BookStayModal({ provider, petId, onClose }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feeding, setFeeding] = useState("");
  const [meds, setMeds] = useState("");
  const book = useBookDaycareStay();

  const reset = () => {
    setStartDate("");
    setEndDate("");
    setFeeding("");
    setMeds("");
  };

  const submit = async () => {
    if (!startDate || !endDate) {
      Alert.alert("Pick dates", "Choose a start and end date for the stay.");
      return;
    }
    try {
      const res = await book.mutateAsync({
        petId,
        provider_id: provider.id,
        location_id: provider.primary_location_id ?? null,
        start_date: startDate,
        end_date: endDate,
        feeding_instructions: feeding || null,
        med_instructions: meds || null,
      });
      const vax = res?.vaccine_status;
      if (vax && vax.required?.length > 0 && !vax.passed) {
        Alert.alert(
          "Stay booked — vaccines needed",
          `Missing: ${vax.missing.join(", ")}. The facility may ask you to share proof.`,
        );
      } else {
        Alert.alert("Stay booked", "Your stay is booked. You'll get daily report cards.");
      }
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't book", e.message || "Please try again.");
    }
  };

  return (
    <Modal
      visible={!!provider}
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
            Book a stay
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
          {provider ? (
            <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginBottom: 16 }}>
              {provider.name}
            </Text>
          ) : null}

          <FieldLabel>Start date</FieldLabel>
          <DateField value={startDate} onChange={setStartDate} placeholder="Select start" />

          <FieldLabel style={{ marginTop: 16 }}>End date</FieldLabel>
          <DateField
            value={endDate}
            onChange={setEndDate}
            placeholder="Select end"
            minimumDate={startDate ? new Date(startDate) : undefined}
          />

          <FieldLabel style={{ marginTop: 16 }}>Feeding instructions</FieldLabel>
          <TextInput
            value={feeding}
            onChangeText={setFeeding}
            placeholder="e.g. Two cups, morning and evening"
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <FieldLabel style={{ marginTop: 16 }}>Medication instructions</FieldLabel>
          <TextInput
            value={meds}
            onChangeText={setMeds}
            placeholder="e.g. 1 tablet with breakfast"
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <TouchableOpacity
            onPress={submit}
            disabled={book.isPending}
            activeOpacity={0.9}
            style={{
              marginTop: 24,
              backgroundColor: COLORS.coral,
              borderRadius: 16,
              paddingVertical: 15,
              alignItems: "center",
              opacity: book.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
              {book.isPending ? "Booking…" : "Confirm stay"}
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
  minHeight: 48,
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

function SectionLabel({ children, style }) {
  return (
    <Text
      style={[
        {
          fontSize: 13,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: 14,
          letterSpacing: 0.6,
        },
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
      <Home size={32} color={COLORS.mutedBrown} />
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
