import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  MapPin,
  Star,
  Phone,
  Calendar as CalendarIcon,
  Clock,
  X,
} from "lucide-react-native";
import { VETS } from "../../../data/mockData";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function VetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showBooking, setShowBooking] = useState(false);
  const [selectedVet, setSelectedVet] = useState(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleBook = (vet) => {
    setSelectedVet(vet);
    setShowBooking(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
        >
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.warmBrown }}>
            Veterinary 🏥
          </Text>
          <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 1 }}>
            Find and book nearby vets
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 14,
            letterSpacing: 0.6,
          }}
        >
          VETS NEAR YOU
        </Text>

        {VETS.map((vet) => (
          <View
            key={vet.id}
            style={{
              backgroundColor: C.card,
              borderRadius: 22,
              padding: 18,
              marginBottom: 14,
              shadowColor: C.terracotta,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.07,
              shadowRadius: 14,
              elevation: 3,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: C.warmBrown,
                  flex: 1,
                }}
              >
                {vet.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#FFF8E1",
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                <Star size={13} color="#F9A825" fill="#F9A825" />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    marginLeft: 4,
                    color: "#B8860B",
                  }}
                >
                  {vet.rating}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 4,
                gap: 6,
              }}
            >
              <MapPin size={13} color={C.mutedBrown} />
              <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                {vet.address}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                color: C.coral,
                fontWeight: "700",
                marginBottom: 16,
              }}
            >
              📍 {vet.distance} away
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 12,
                  borderRadius: 13,
                  backgroundColor: C.sand,
                  borderWidth: 1,
                  borderColor: C.peach,
                  gap: 6,
                }}
              >
                <Phone size={16} color={C.warmBrown} />
                <Text
                  style={{
                    fontWeight: "700",
                    color: C.warmBrown,
                    fontSize: 13,
                  }}
                >
                  Call
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleBook(vet)}
                style={{
                  flex: 2,
                  padding: 12,
                  borderRadius: 13,
                  backgroundColor: C.coral,
                  alignItems: "center",
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                }}
              >
                <Text
                  style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}
                >
                  Book Appointment
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Booking Modal */}
      <Modal visible={showBooking} animationType="slide">
        <View
          style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}
        >
          <View
            style={{
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: C.card,
            }}
          >
            <View>
              <Text
                style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown }}
              >
                Book with {selectedVet?.name}
              </Text>
              <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
                Fill in the details below
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowBooking(false)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={16} color={C.mutedBrown} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Reason for visit
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 9,
                marginBottom: 22,
              }}
            >
              {["Checkup", "Vaccination", "Injury", "Dental", "Grooming"].map(
                (r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setSelectedReason(r)}
                    style={{
                      paddingHorizontal: 15,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: selectedReason === r ? C.coral : C.peach,
                      backgroundColor: selectedReason === r ? C.coral : C.sand,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        color: selectedReason === r ? "#FFF" : C.mutedBrown,
                        fontSize: 13,
                      }}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Select Date
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 15,
                backgroundColor: C.sand,
                borderRadius: 14,
                marginBottom: 18,
                borderWidth: 1,
                borderColor: C.peach,
                gap: 12,
              }}
            >
              <CalendarIcon size={18} color={C.coral} />
              <Text style={{ color: C.mutedBrown, fontSize: 14 }}>
                Pick a date
              </Text>
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Select Time
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 15,
                backgroundColor: C.sand,
                borderRadius: 14,
                marginBottom: 18,
                borderWidth: 1,
                borderColor: C.peach,
                gap: 12,
              }}
            >
              <Clock size={18} color={C.coral} />
              <Text style={{ color: C.mutedBrown, fontSize: 14 }}>
                Pick a time
              </Text>
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              Notes
            </Text>
            <TextInput
              placeholder="Describe symptoms or special needs..."
              placeholderTextColor={C.mutedBrown}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                padding: 15,
                minHeight: 100,
                textAlignVertical: "top",
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
              }}
              multiline
              value={notes}
              onChangeText={setNotes}
            />

            <TouchableOpacity
              onPress={() => {
                setShowBooking(false);
                Alert.alert(
                  "✅ Request sent!",
                  "The vet will confirm your appointment soon.",
                );
              }}
              style={{
                backgroundColor: C.coral,
                borderRadius: 16,
                padding: 18,
                alignItems: "center",
                marginTop: 28,
                shadowColor: C.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                Confirm Appointment 🏥
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
