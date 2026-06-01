import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
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
    color: C.sage,
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
    color: C.coral,
    action: "walkActivity",
  },
  {
    icon: Weight,
    label: "Weight",
    description: "Track weight over time",
    color: "#9575CD",
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
  },
  {
    icon: Heart,
    label: "Vital Signs",
    description: "Temperature, heart rate, breathing",
    color: "#E57373",
  },
  {
    icon: Stethoscope,
    label: "Vet Visits",
    description: "Appointments, exams, procedures",
    color: C.terracotta,
  },
  {
    icon: Syringe,
    label: "Vaccinations",
    description: "Vaccine history, upcoming shots",
    color: "#4DB6AC",
  },
];

export default function HealthTrack() {
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
    }
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        {/* Section Title */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 4,
            }}
          >
            Track Health Data
          </Text>
          <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
            Choose what you'd like to track for Phoebe
          </Text>
        </View>

        {/* Tracker Cards */}
        <View style={{ gap: 12 }}>
          {TRACKERS.map((tracker, idx) => {
            const Icon = tracker.icon;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => handleTrackerPress(tracker)}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                  shadowColor: C.terracotta,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
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
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 3,
                    }}
                  >
                    {tracker.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                    }}
                  >
                    {tracker.description}
                  </Text>
                </View>
                <ArrowRight size={20} color={C.mutedBrown} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info Box */}
        <View
          style={{
            marginTop: 20,
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: C.mutedBrown,
              lineHeight: 19,
              textAlign: "center",
            }}
          >
            Track changes over time to share meaningful data with your vet. The
            more you track, the better prepared you'll be for appointments.
          </Text>
        </View>
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
