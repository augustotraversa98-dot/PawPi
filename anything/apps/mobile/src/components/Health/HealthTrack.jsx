import React, { useState } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import {
  Activity,
  Droplet,
  UtensilsCrossed,
  Pill,
  Weight,
  ThermometerSun,
  Heart,
  Stethoscope,
  Syringe,
  ArrowRight,
  Camera,
  Salad,
  ClipboardCheck,
} from "lucide-react-native";
import PhotoCheckModal from "./PhotoCheck/PhotoCheckModal";
import FoodWaterTrackerModal from "./FoodWater/FoodWaterTrackerModal";
import PooTrackerModal from "./Poo/PooTrackerModal";
import PeeTrackerModal from "./Pee/PeeTrackerModal";
import VomitTrackerModal from "./Vomit/VomitTrackerModal";
import WalkActivityModal from "./WalkActivity/WalkActivityModal";
import GeneralCheckModal from "./GeneralCheck/GeneralCheckModal";
import MedicationModal from "./Medication/MedicationModal";
import WeightModal from "./Weight/WeightModal";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

const TRACKERS = [
  {
    icon: Camera,
    label: "Photo Check",
    description: "Track visible changes by body area over time",
    color: "#64B5F6",
    action: "photoCheck",
  },
  {
    icon: ClipboardCheck,
    label: "General Check",
    description:
      "Quick visual check of eyes, ears, teeth, skin, paws, mood, and energy",
    color: "#9575CD",
    action: "generalCheck",
  },
  {
    icon: UtensilsCrossed,
    label: "Food & Treats",
    description: "Meals, treats, appetite changes",
    color: COLORS.sage,
    action: "foodWater",
  },
  {
    icon: Droplet,
    label: "Water Intake",
    description: "Daily water consumption",
    color: "#64B5F6",
    action: "foodWater",
  },
  {
    icon: Droplet,
    label: "Pee & Urination",
    description: "Track frequency, color, and patterns",
    color: "#42A5F5",
    action: "pee",
  },
  {
    icon: Activity,
    label: "Poo & Digestion",
    description: "Track consistency, color, and changes",
    color: "#8D6E63",
    action: "poo",
  },
  {
    icon: Salad,
    label: "Vomit / Digestive Events",
    description: "Track vomiting, episodes, and related symptoms",
    color: "#FFB74D",
    action: "vomit",
  },
  {
    icon: Activity,
    label: "Exercise & Walks",
    description: "Activity level, duration, intensity",
    color: COLORS.coral,
    action: "walkActivity",
  },
  {
    icon: Weight,
    label: "Weight",
    description: "Track weight over time",
    color: "#9575CD",
    action: "weight",
  },
  {
    icon: Pill,
    label: "Medications & Care",
    description: "Medications, vaccines, flea/tick prevention, supplements",
    color: "#FFB74D",
    action: "medications",
  },
  {
    icon: ThermometerSun,
    label: "Symptoms & Behavior",
    description: "Changes, observations, notes",
    color: "#FF8A65",
    comingSoon: true,
  },
  {
    icon: Heart,
    label: "Vital Signs",
    description: "Temperature, heart rate, breathing",
    color: "#E57373",
    comingSoon: true,
  },
  {
    icon: Stethoscope,
    label: "Vet Visits",
    description: "Appointments, exams, procedures",
    color: COLORS.terracotta,
    comingSoon: true,
  },
  {
    icon: Syringe,
    label: "Vaccinations",
    description: "Vaccine history, upcoming shots",
    color: "#4DB6AC",
    comingSoon: true,
  },
];

export default function HealthTrack() {
  const { data: currentPet } = useCurrentPet();
  const petName = currentPet?.name || "your pet";
  const [photoCheckModalVisible, setPhotoCheckModalVisible] = useState(false);
  const [foodWaterModalVisible, setFoodWaterModalVisible] = useState(false);
  const [foodWaterModalType, setFoodWaterModalType] = useState("food");
  const [pooModalVisible, setPooModalVisible] = useState(false);
  const [peeModalVisible, setPeeModalVisible] = useState(false);
  const [vomitModalVisible, setVomitModalVisible] = useState(false);
  const [walkActivityModalVisible, setWalkActivityModalVisible] =
    useState(false);
  const [generalCheckModalVisible, setGeneralCheckModalVisible] =
    useState(false);
  const [medicationModalVisible, setMedicationModalVisible] = useState(false);
  const [weightModalVisible, setWeightModalVisible] = useState(false);

  const handlePhotoCheckSave = (photoData) => {
    console.log("Photo check saved:", photoData);
  };

  const handleTrackerPress = (tracker) => {
    if (tracker.action === "photoCheck") {
      setPhotoCheckModalVisible(true);
    } else if (tracker.action === "generalCheck") {
      setGeneralCheckModalVisible(true);
    } else if (tracker.action === "medications") {
      setMedicationModalVisible(true);
    } else if (tracker.action === "foodWater") {
      setFoodWaterModalType(
        tracker.label === "Water Intake" ? "water" : "food",
      );
      setFoodWaterModalVisible(true);
    } else if (tracker.action === "poo") {
      setPooModalVisible(true);
    } else if (tracker.action === "pee") {
      setPeeModalVisible(true);
    } else if (tracker.action === "vomit") {
      setVomitModalVisible(true);
    } else if (tracker.action === "walkActivity") {
      setWalkActivityModalVisible(true);
    } else if (tracker.action === "weight") {
      setWeightModalVisible(true);
    } else if (tracker.comingSoon) {
      // Honest feedback instead of a silent dead tap for trackers not yet built.
      Alert.alert(
        `${tracker.label} — coming soon`,
        `${tracker.label} tracking for ${petName} is on the way. In the meantime, you can note it under Food & Treats or your Vet Record.`,
      );
    }
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: SPACING.lg }}>
        {/* Section Title */}
        <View style={{ marginBottom: SPACING.xl }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.xs }]}>
            Track Health Data
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
            Choose what you'd like to track for {petName}
          </Text>
        </View>

        {/* Tracker Cards */}
        <View style={{ gap: SPACING.md }}>
          {TRACKERS.map((tracker, idx) => {
            const Icon = tracker.icon;
            return (
              <PressableScale
                key={idx}
                onPress={() => handleTrackerPress(tracker)}
                accessibilityRole="button"
                style={{
                  backgroundColor: MATERIALS.surface,
                  borderRadius: RADIUS.card,
                  padding: SPACING.lg,
                  borderWidth: 1,
                  borderColor: MATERIALS.hairline,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.md,
                  ...ELEVATION.sm,
                }}
              >
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: tracker.color + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Icon size={24} color={tracker.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACING.xs,
                      marginBottom: 3,
                    }}
                  >
                    <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
                      {tracker.label}
                    </Text>
                    {tracker.comingSoon && (
                      <View
                        style={{
                          backgroundColor: MATERIALS.surfaceSunken,
                          borderRadius: RADIUS.chip,
                          paddingHorizontal: SPACING.sm,
                          paddingVertical: 2,
                          borderWidth: 1,
                          borderColor: MATERIALS.hairline,
                        }}
                      >
                        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
                          Soon
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 17 }]}>
                    {tracker.description}
                  </Text>
                </View>
                <ArrowRight size={20} color={COLORS.mutedBrown} />
              </PressableScale>
            );
          })}
        </View>

        {/* Info Box */}
        <Card
          level="none"
          radius={RADIUS.card}
          color={MATERIALS.surfaceSunken}
          borderColor={MATERIALS.hairline}
          style={{ marginTop: SPACING.xl, padding: SPACING.lg }}
        >
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, lineHeight: 19, textAlign: "center", fontWeight: "500" }]}>
            Track changes over time to share meaningful data with your vet. The
            more you track, the better prepared you'll be for appointments.
          </Text>
        </Card>
      </View>

      {/* Photo Check Modal */}
      <PhotoCheckModal
        visible={photoCheckModalVisible}
        onClose={() => setPhotoCheckModalVisible(false)}
        onSave={handlePhotoCheckSave}
      />

      {/* Food & Water Tracker Modal */}
      <FoodWaterTrackerModal
        visible={foodWaterModalVisible}
        onClose={() => setFoodWaterModalVisible(false)}
        initialType={foodWaterModalType}
      />

      {/* Poo Tracker Modal */}
      <PooTrackerModal
        visible={pooModalVisible}
        onClose={() => setPooModalVisible(false)}
      />

      {/* Pee Tracker Modal */}
      <PeeTrackerModal
        visible={peeModalVisible}
        onClose={() => setPeeModalVisible(false)}
      />

      {/* Vomit Tracker Modal */}
      <VomitTrackerModal
        visible={vomitModalVisible}
        onClose={() => setVomitModalVisible(false)}
      />

      {/* Walk Activity Modal */}
      <WalkActivityModal
        visible={walkActivityModalVisible}
        onClose={() => setWalkActivityModalVisible(false)}
      />

      {/* General Check Modal */}
      <GeneralCheckModal
        visible={generalCheckModalVisible}
        onClose={() => setGeneralCheckModalVisible(false)}
      />

      {/* Medication Modal */}
      <MedicationModal
        visible={medicationModalVisible}
        onClose={() => setMedicationModalVisible(false)}
      />

      {/* Weight Modal */}
      <WeightModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
      />
    </ScrollView>
  );
}
