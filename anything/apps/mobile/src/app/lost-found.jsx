import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, MapPin, AlertTriangle, X, Send, CheckCircle2, Bell } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import WalkMapPicker from "@/components/SocialWalks/WalkMapPicker";
import { isValidCoord } from "@/utils/walkBuddies";
import {
  useLostReports,
  useMyLostReports,
  useLostReport,
  useMarkLost,
  useReportSighting,
  useResolveLost,
} from "@/hooks/useLostFound";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  red: "#D7553F",
  peach: "#FFD9B3",
  sand: "#F8EBDD",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function LostFoundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();

  const [tab, setTab] = useState("near"); // 'near' | 'mine'
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({});
        if (active && isValidCoord(pos?.coords?.latitude, pos?.coords?.longitude)) {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {}
    })();
    return () => { active = false; };
  }, []);

  const { data: nearby, isLoading: nearbyLoading } = useLostReports(location);
  const { data: mine } = useMyLostReports();
  const markLost = useMarkLost();
  const resolve = useResolveLost();

  const myActive = (mine || []).find(
    (r) => r.pet_id === currentPet?.id && r.status === "active",
  );

  const [sightingFor, setSightingFor] = useState(null); // a report
  const [markVisible, setMarkVisible] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="lost-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>Lost & Found</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 14 }}>
        {[
          { key: "near", label: "Alerts near me" },
          { key: "mine", label: "My pet" },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            testID={`tab-${key}`}
            onPress={() => setTab(key)}
            style={{
              paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20,
              backgroundColor: tab === key ? C.red : C.sand,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: tab === key ? "#FFF" : C.warmBrown }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {tab === "near" ? (
          <>
            {nearbyLoading && <ActivityIndicator color={C.red} />}
            {!nearbyLoading && nearby && nearby.length === 0 && (
              <View style={{ alignItems: "center", padding: 40 }}>
                <Text style={{ fontSize: 34 }}>🐾</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown, marginTop: 10 }}>
                  No lost pets nearby
                </Text>
                <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 4 }}>
                  Hopefully it stays that way.
                </Text>
              </View>
            )}
            {nearby?.map((r) => (
              <View key={r.id} testID={`alert-${r.id}`} style={styles.alertCard}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <View style={styles.lostBadge}>
                    <AlertTriangle size={13} color="#FFF" />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>LOST</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown, marginLeft: 10 }}>
                    {r.pet_name}
                  </Text>
                </View>
                {r.pet_breed ? (
                  <Text style={{ fontSize: 13, color: C.mutedBrown, marginBottom: 4 }}>{r.pet_breed}</Text>
                ) : null}
                {r.last_seen_area ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <MapPin size={13} color={C.red} />
                    <Text style={{ fontSize: 13, color: C.warmBrown }}>Last seen: {r.last_seen_area}</Text>
                  </View>
                ) : null}
                {r.notes ? (
                  <Text style={{ fontSize: 13, color: C.mutedBrown, marginBottom: 10 }}>{r.notes}</Text>
                ) : null}
                {r.reward ? (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.sageDark, marginBottom: 10 }}>
                    Reward: {r.reward}
                  </Text>
                ) : null}
                <TouchableOpacity
                  testID={`report-sighting-${r.id}`}
                  onPress={() => setSightingFor(r)}
                  style={styles.sightingBtn}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>I've seen this pet</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <>
            {myActive ? (
              <MyActiveReport report={myActive} onResolve={() => resolve.mutate(myActive.id)} resolving={resolve.isPending} />
            ) : (
              <View style={{ alignItems: "center", padding: 20 }}>
                <Text style={{ fontSize: 40 }}>🐕</Text>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown, marginTop: 12 }}>
                  {currentPet?.name || "Your pet"} is safe
                </Text>
                <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 4, textAlign: "center" }}>
                  If they ever go missing, mark them lost to alert nearby users and followers.
                </Text>
                <TouchableOpacity
                  testID="mark-lost-open"
                  onPress={() => setMarkVisible(true)}
                  disabled={!currentPet?.id}
                  style={[styles.markLostBtn, !currentPet?.id && { opacity: 0.5 }]}
                >
                  <AlertTriangle size={18} color="#FFF" />
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>Mark as lost</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Report sighting modal */}
      <SightingModal report={sightingFor} onClose={() => setSightingFor(null)} insets={insets} />

      {/* Mark lost modal */}
      <MarkLostModal
        visible={markVisible}
        pet={currentPet}
        onClose={() => setMarkVisible(false)}
        markLost={markLost}
        insets={insets}
      />
    </View>
  );
}

function MyActiveReport({ report, onResolve, resolving }) {
  const { data } = useLostReport(report.id);
  const sightings = data?.sightings || [];
  return (
    <View>
      <View style={[styles.alertCard, { borderColor: C.red }]}>
        <View style={styles.lostBadge}>
          <AlertTriangle size={13} color="#FFF" />
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>LOST MODE ON</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginTop: 8 }}>
          {report.pet_name}
        </Text>
        {report.last_seen_area ? (
          <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 4 }}>
            Last seen: {report.last_seen_area}
          </Text>
        ) : null}
        <TouchableOpacity testID="resolve-lost" onPress={onResolve} disabled={resolving} style={styles.resolveBtn}>
          {resolving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <CheckCircle2 size={18} color="#FFF" />
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>Found — resolve</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>SIGHTINGS ({sightings.length})</Text>
      {sightings.length === 0 && (
        <Text style={{ fontSize: 13, color: C.mutedBrown }}>No sightings reported yet.</Text>
      )}
      {sightings.map((s) => (
        <View key={s.id} testID={`sighting-${s.id}`} style={styles.sightingRow}>
          <Bell size={16} color={C.coral} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: C.warmBrown }}>{s.note || "Spotted"}</Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              by @{s.reporter_username || "someone"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SightingModal({ report, onClose, insets }) {
  const reportSighting = useReportSighting(report?.id);
  const [note, setNote] = useState("");
  const submit = () => {
    if (!note.trim()) return;
    reportSighting.mutate({ note: note.trim() }, { onSuccess: () => { setNote(""); onClose(); } });
  };
  return (
    <Modal visible={!!report} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
        <View style={styles.header}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
            Report a sighting
          </Text>
          <TouchableOpacity testID="sighting-close" onPress={onClose}>
            <X size={20} color={C.warmBrown} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ fontSize: 14, color: C.mutedBrown, marginBottom: 14 }}>
            Where and when did you see {report?.pet_name}? Any detail helps the owner.
          </Text>
          <TextInput
            testID="sighting-note"
            value={note}
            onChangeText={setNote}
            placeholder="Saw them near the dog park, heading north..."
            placeholderTextColor={C.mutedBrown + "90"}
            multiline
            style={styles.input}
          />
          <TouchableOpacity
            testID="sighting-submit"
            onPress={submit}
            disabled={!note.trim() || reportSighting.isPending}
            style={[styles.submitBtn, (!note.trim() || reportSighting.isPending) && { opacity: 0.6 }]}
          >
            {reportSighting.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Send size={18} color="#FFF" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>Send sighting</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MarkLostModal({ visible, pet, onClose, markLost, insets }) {
  const [coord, setCoord] = useState(null);
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [reward, setReward] = useState("");

  const submit = () => {
    if (!pet?.id) return;
    markLost.mutate(
      {
        petId: pet.id,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        lastSeenArea: area.trim() || null,
        notes: notes.trim() || null,
        reward: reward.trim() || null,
      },
      { onSuccess: () => { setArea(""); setNotes(""); setReward(""); setCoord(null); onClose(); } },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
        <View style={styles.header}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
            Mark {pet?.name || "pet"} as lost
          </Text>
          <TouchableOpacity testID="mark-close" onPress={onClose}>
            <X size={20} color={C.warmBrown} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Last-seen location</Text>
          <WalkMapPicker coord={coord} onPick={setCoord} testID="lost-map-picker" />
          <TextInput
            testID="lost-area"
            value={area}
            onChangeText={setArea}
            placeholder="Area / cross streets"
            placeholderTextColor={C.mutedBrown + "90"}
            style={[styles.input, { marginTop: 10 }]}
          />
          <Text style={[styles.label, { marginTop: 16 }]}>Notes</Text>
          <TextInput
            testID="lost-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Collar color, temperament, anything that helps..."
            placeholderTextColor={C.mutedBrown + "90"}
            multiline
            style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
          />
          <Text style={[styles.label, { marginTop: 16 }]}>Reward (optional)</Text>
          <TextInput
            testID="lost-reward"
            value={reward}
            onChangeText={setReward}
            placeholder="e.g. $100"
            placeholderTextColor={C.mutedBrown + "90"}
            style={styles.input}
          />
          <TouchableOpacity
            testID="mark-lost-submit"
            onPress={submit}
            disabled={markLost.isPending}
            style={[styles.markLostBtn, { marginTop: 24 }, markLost.isPending && { opacity: 0.6 }]}
          >
            {markLost.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <AlertTriangle size={18} color="#FFF" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>Activate lost mode</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = {
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.peach,
  },
  alertCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  lostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: C.red,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sightingBtn: {
    backgroundColor: C.coral,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  markLostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.red,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  resolveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.sageDark,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 12,
  },
  sightingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.peach,
  },
  label: { fontSize: 14, fontWeight: "700", color: C.warmBrown, marginBottom: 8 },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.coral,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 20,
  },
};
