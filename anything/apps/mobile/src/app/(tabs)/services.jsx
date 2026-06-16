import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Stethoscope, ChevronRight, PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Pet Services hub — promoted into the main bottom navigation so the built
// provider/booking loops are reachable in 1-2 taps.
//
// IMPORTANT: only LIVE provider types are featured here. Veterinary is the only
// type built end-to-end today, so it is the only entry. As walker / daycare /
// groomer / shop / adoption ship their type modules, add them to LIVE_SERVICES
// (no mock / "coming soon" rows — empty state or omit, per the data rules).
const LIVE_SERVICES = [
  {
    key: "vet",
    title: "Veterinary",
    subtitle: "Find and book a vet, then share records",
    emoji: "🏥",
    icon: Stethoscope,
    route: "/(tabs)/more/vet",
  },
];

export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: COLORS.warmBrown,
            letterSpacing: -0.5,
          }}
        >
          Pet Services 🐾
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
          Book trusted care for your dog.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {LIVE_SERVICES.length === 0 ? (
          <EmptyState />
        ) : (
          LIVE_SERVICES.map((service) => (
            <ServiceCard
              key={service.key}
              service={service}
              onPress={() => router.push(service.route)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ServiceCard({ service, onPress }) {
  const Icon = service.icon;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 18,
        backgroundColor: COLORS.card,
        borderRadius: 20,
        marginBottom: 12,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: COLORS.coral + "20",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
        }}
      >
        {service.emoji ? (
          <Text style={{ fontSize: 26 }}>{service.emoji}</Text>
        ) : (
          <Icon size={24} color={COLORS.coral} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}>
          {service.title}
        </Text>
        {service.subtitle ? (
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              marginTop: 3,
              lineHeight: 18,
            }}
          >
            {service.subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={COLORS.peach} />
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 32,
        alignItems: "center",
        marginTop: 24,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <PawPrint size={34} color={COLORS.mutedBrown} />
      <Text
        style={{
          fontSize: 16,
          fontWeight: "800",
          color: COLORS.warmBrown,
          marginTop: 12,
        }}
      >
        No services available yet
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        Check back soon — pet care providers are joining PawPi.
      </Text>
    </View>
  );
}
