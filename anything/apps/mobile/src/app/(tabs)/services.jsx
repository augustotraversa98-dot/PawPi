import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Stethoscope,
  Scissors,
  Footprints,
  Home,
  Heart,
  GraduationCap,
  ShoppingBag,
  PawPrint,
  ChevronRight,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Pet Services hub — a quick-access CATEGORY GRID promoted into the main bottom
// navigation so the built provider/booking loops are 1-2 taps away.
//
// Veterinary (ticket 2.0) and Grooming (ticket 2.6) are built end-to-end today, so
// they are the LIVE cards: each navigates to its single canonical discovery screen
// (more/vet.jsx, more/grooming.jsx — no duplicate discovery screen). Every other
// catalog category is rendered as a "Coming soon" SIGNPOST card: visible and clearly
// badged, but NOT tappable into any flow and with NO fake provider data behind it.
// These light up in later Phase-2 tickets (walking → daycare/boarding → sitting →
// training → shop → adoption).
const CATEGORIES = [
  {
    key: "vet",
    title: "Veterinary",
    subtitle: "Find and book a vet, then share records",
    icon: Stethoscope,
    live: true,
    route: "/(tabs)/more/vet",
  },
  {
    key: "grooming",
    title: "Grooming",
    subtitle: "Baths, trims, and nail care",
    icon: Scissors,
    live: true,
    route: "/(tabs)/more/grooming",
  },
  {
    key: "walking",
    title: "Dog Walking",
    subtitle: "On-demand and scheduled walks",
    icon: Footprints,
    live: false,
  },
  {
    key: "boarding",
    title: "Daycare & Boarding",
    subtitle: "Day stays and overnight care",
    icon: Home,
    live: false,
  },
  {
    key: "sitting",
    title: "Pet Sitting",
    subtitle: "In-home visits and care",
    icon: Heart,
    live: false,
  },
  {
    key: "training",
    title: "Training",
    subtitle: "Obedience and behavior help",
    icon: GraduationCap,
    live: false,
  },
  {
    key: "shop",
    title: "Shop",
    subtitle: "Food, toys, and supplies",
    icon: ShoppingBag,
    live: false,
  },
  {
    key: "adoption",
    title: "Adoption",
    subtitle: "Find a dog to bring home",
    icon: PawPrint,
    live: false,
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
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {CATEGORIES.map((category) =>
            category.live ? (
              <CategoryCard
                key={category.key}
                category={category}
                onPress={() => router.push(category.route)}
              />
            ) : (
              <CategoryCard key={category.key} category={category} />
            ),
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CategoryCard({ category, onPress }) {
  const Icon = category.icon;
  const isLive = category.live;

  // Coming-soon cards are pure signposts: rendered with no onPress so they are
  // not tappable into any flow (no fake data behind them).
  const Wrapper = isLive ? TouchableOpacity : View;
  const wrapperProps = isLive
    ? { onPress, activeOpacity: 0.9, accessibilityRole: "button" }
    : { accessibilityRole: "text" };

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        width: "48%",
        padding: 16,
        backgroundColor: COLORS.card,
        borderRadius: 20,
        marginBottom: 14,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isLive ? 0.07 : 0.03,
        shadowRadius: 14,
        elevation: isLive ? 3 : 1,
        borderWidth: 1,
        borderColor: COLORS.peach,
        opacity: isLive ? 1 : 0.65,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: COLORS.coral + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={22} color={COLORS.coral} />
        </View>
        {isLive ? (
          <ChevronRight size={18} color={COLORS.peach} />
        ) : (
          <ComingSoonBadge />
        )}
      </View>

      <Text
        style={{
          fontSize: 15,
          fontWeight: "800",
          color: COLORS.warmBrown,
          marginTop: 12,
        }}
      >
        {category.title}
      </Text>
      {category.subtitle ? (
        <Text
          style={{
            fontSize: 12,
            color: COLORS.mutedBrown,
            marginTop: 3,
            lineHeight: 16,
          }}
        >
          {category.subtitle}
        </Text>
      ) : null}
    </Wrapper>
  );
}

function ComingSoonBadge() {
  return (
    <View
      style={{
        backgroundColor: COLORS.sand,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          letterSpacing: 0.3,
        }}
      >
        Coming soon
      </Text>
    </View>
  );
}
