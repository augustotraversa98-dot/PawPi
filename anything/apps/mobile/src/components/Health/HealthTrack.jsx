import React, { useState } from "react";
import { View, Text, ScrollView, Modal, TouchableOpacity, Alert } from "react-native";
import {
  Activity,
  Droplet,
  UtensilsCrossed,
  Pill,
  Weight,
  ArrowRight,
  Camera,
  Salad,
  ClipboardCheck,
  X,
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
import { useTranslation } from "react-i18next";
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

// Track is two sections mapped to how owners think:
//   • Everyday — quick daily logs (these fill the Care Ring / Today's Progress)
//   • Health records — care / medical history for the vet
// Labels + descriptions come from i18n (`health.trackScreen.<id>Label/Desc`) so the
// whole screen is bilingual. Each tile carries an `id` (the i18n slug) and either an
// `action` (a real logging surface) OR `comingSoon: true` (display-only). See the
// structural invariant below — a coming-soon tile can NEVER carry an `action`.
//
// Exported for the test that asserts the structural invariant.
export const TRACKERS = [
  // ── Everyday ─────────────────────────────────────────────────────────────
  {
    id: "foodWater",
    section: "everyday",
    icon: UtensilsCrossed,
    color: COLORS.sage,
    action: "foodWater",
  },
  {
    id: "bathroom",
    section: "everyday",
    icon: Droplet,
    color: "#42A5F5",
    action: "bathroom",
  },
  {
    id: "walk",
    section: "everyday",
    icon: Activity,
    color: COLORS.coral,
    action: "walkActivity",
  },
  {
    id: "weight",
    section: "everyday",
    icon: Weight,
    color: "#9575CD",
    action: "weight",
  },
  {
    id: "quickCheck",
    section: "everyday",
    icon: ClipboardCheck,
    color: "#9575CD",
    action: "generalCheck",
  },
  // ── Health records ───────────────────────────────────────────────────────
  // Medications & Care covers meds, vaccines, and preventives (its modal has all
  // three tabs) — there is no separate Vaccines tile. Vet visits are vet-authored
  // medical history surfaced read-only in the Vet Record, not an owner quick-log,
  // so there is no Vet Visits tile here either.
  {
    id: "medications",
    section: "records",
    icon: Pill,
    color: "#FFB74D",
    action: "medications",
  },
  {
    id: "photoCheck",
    section: "records",
    icon: Camera,
    color: "#64B5F6",
    action: "photoCheck",
  },
  // No coming-soon tiles remain — every tile opens a real logging surface. The
  // structural invariant below still holds vacuously (and guards future additions).
];

const SECTIONS = [
  { key: "everyday", headerKey: "sectionEveryday", hintKey: "sectionEverydayHint" },
  { key: "records", headerKey: "sectionRecords", hintKey: "sectionRecordsHint" },
];

// Structural invariant (Care Ring / Track integrity): a coming-soon tile must be
// display-only — it can NEVER carry an `action`, so it can never open a logging
// modal, POST a health log, or invalidate ["care-ring"]. Only real logs fill the
// ring. If this ever fails, a comingSoon tile has been wired to a write path.
export const comingSoonTrackersHaveNoAction = TRACKERS.every(
  (t) => !t.comingSoon || t.action == null,
);
if (__DEV__ && !comingSoonTrackersHaveNoAction) {
  console.error(
    "[HealthTrack] A coming-soon tracker carries an `action` — it could write a log/fill the Care Ring. Remove the action.",
  );
}

export default function HealthTrack() {
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const petName = currentPet?.name || t("common.yourPet");

  const [photoCheckModalVisible, setPhotoCheckModalVisible] = useState(false);
  const [foodWaterModalVisible, setFoodWaterModalVisible] = useState(false);
  const [foodWaterModalType, setFoodWaterModalType] = useState("food");
  const [bathroomChooserVisible, setBathroomChooserVisible] = useState(false);
  const [pooModalVisible, setPooModalVisible] = useState(false);
  const [peeModalVisible, setPeeModalVisible] = useState(false);
  const [vomitModalVisible, setVomitModalVisible] = useState(false);
  const [walkActivityModalVisible, setWalkActivityModalVisible] =
    useState(false);
  const [generalCheckModalVisible, setGeneralCheckModalVisible] =
    useState(false);
  const [medicationModalVisible, setMedicationModalVisible] = useState(false);
  const [medicationTab, setMedicationTab] = useState("medications");
  const [weightModalVisible, setWeightModalVisible] = useState(false);

  const labelFor = (id) => t(`health.trackScreen.${id}Label`);
  const descFor = (id) => t(`health.trackScreen.${id}Desc`);

  const handlePhotoCheckSave = (photoData) => {
    // Photo Check persistence needs the upload flow (PhotoCheckCaptureModal + useUpload)
    // to turn the local capture into a hosted URL; PhotoCheckModal only yields a local
    // file:// URI, so we deliberately DON'T POST it here (a device-local path would be
    // unusable everywhere else). Left as a known follow-up rather than storing bad data.
    console.log("Photo check captured:", photoData);
  };

  const handleTrackerPress = (tracker) => {
    // STRUCTURAL guard first: a coming-soon tile shows honest feedback and writes
    // NOTHING — no modal, no log, no ["care-ring"] invalidation. Return before any
    // action dispatch so an unbuilt tracker can never fill a Care Ring segment.
    if (tracker.comingSoon) {
      const label = labelFor(tracker.id);
      Alert.alert(
        t("health.trackerSoonTitle", { label }),
        t("health.trackerSoonBody", { label, pet: petName }),
      );
      return;
    }
    switch (tracker.action) {
      case "photoCheck":
        setPhotoCheckModalVisible(true);
        break;
      case "generalCheck":
        setGeneralCheckModalVisible(true);
        break;
      case "medications":
        setMedicationTab("medications");
        setMedicationModalVisible(true);
        break;
      case "foodWater":
        setFoodWaterModalType("food");
        setFoodWaterModalVisible(true);
        break;
      case "bathroom":
        setBathroomChooserVisible(true);
        break;
      case "walkActivity":
        setWalkActivityModalVisible(true);
        break;
      case "weight":
        setWeightModalVisible(true);
        break;
      default:
        break;
    }
  };

  const openBathroom = (which) => {
    setBathroomChooserVisible(false);
    if (which === "pee") setPeeModalVisible(true);
    else if (which === "poo") setPooModalVisible(true);
    else if (which === "vomit") setVomitModalVisible(true);
  };

  const renderTile = (tracker) => {
    const Icon = tracker.icon;
    return (
      <PressableScale
        key={tracker.id}
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
              {labelFor(tracker.id)}
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
                  {t("health.trackerSoon")}
                </Text>
              </View>
            )}
          </View>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 17 }]}>
            {descFor(tracker.id)}
          </Text>
        </View>
        <ArrowRight size={20} color={COLORS.mutedBrown} />
      </PressableScale>
    );
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: SPACING.lg }}>
        {/* Section Title */}
        <View style={{ marginBottom: SPACING.xl }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.xs }]}>
            {t("health.trackScreen.title")}
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
            {t("health.trackScreen.subtitle", { pet: petName })}
          </Text>
        </View>

        {/* Two sections: Everyday · Health records */}
        {SECTIONS.map((section) => (
          <View key={section.key} style={{ marginBottom: SPACING.xl }}>
            <Text
              style={[
                TYPE.overline,
                { color: COLORS.terracotta, textTransform: "uppercase", marginBottom: 2 },
              ]}
            >
              {t(`health.trackScreen.${section.headerKey}`)}
            </Text>
            <Text
              style={[TYPE.footnote, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}
            >
              {t(`health.trackScreen.${section.hintKey}`, { pet: petName })}
            </Text>
            <View style={{ gap: SPACING.md }}>
              {TRACKERS.filter((tr) => tr.section === section.key).map(renderTile)}
            </View>
          </View>
        ))}

        {/* Info Box */}
        <Card
          level="none"
          radius={RADIUS.card}
          color={MATERIALS.surfaceSunken}
          borderColor={MATERIALS.hairline}
          style={{ marginTop: SPACING.xs, padding: SPACING.lg }}
        >
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, lineHeight: 19, textAlign: "center", fontWeight: "500" }]}>
            {t("health.trackScreen.infoBox")}
          </Text>
        </Card>
      </View>

      {/* Bathroom & Digestion chooser — folds pee / poo / vomit behind one entry.
          The three existing modals already persist to their own APIs. */}
      <Modal
        visible={bathroomChooserVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBathroomChooserVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: MATERIALS.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: SPACING.lg,
              paddingBottom: SPACING.xxl,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: SPACING.xs,
              }}
            >
              <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
                {t("health.trackScreen.chooserTitle")}
              </Text>
              <TouchableOpacity
                onPress={() => setBathroomChooserVisible(false)}
                accessibilityLabel={t("common.close")}
              >
                <X size={22} color={COLORS.mutedBrown} />
              </TouchableOpacity>
            </View>
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginBottom: SPACING.lg }]}>
              {t("health.trackScreen.chooserSubtitle", { pet: petName })}
            </Text>

            <View style={{ gap: SPACING.md }}>
              {[
                { key: "pee", icon: Droplet, color: "#42A5F5" },
                { key: "poo", icon: Activity, color: "#8D6E63" },
                { key: "vomit", icon: Salad, color: "#FFB74D" },
              ].map((opt) => {
                const OptIcon = opt.icon;
                const cap = opt.key.charAt(0).toUpperCase() + opt.key.slice(1);
                return (
                  <PressableScale
                    key={opt.key}
                    onPress={() => openBathroom(opt.key)}
                    accessibilityRole="button"
                    style={{
                      backgroundColor: MATERIALS.surfaceSunken,
                      borderRadius: RADIUS.card,
                      padding: SPACING.lg,
                      borderWidth: 1,
                      borderColor: MATERIALS.hairline,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACING.md,
                    }}
                  >
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        backgroundColor: opt.color + "20",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <OptIcon size={22} color={opt.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
                        {t(`health.trackScreen.chooser${cap}`)}
                      </Text>
                      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                        {t(`health.trackScreen.chooser${cap}Desc`)}
                      </Text>
                    </View>
                    <ArrowRight size={18} color={COLORS.mutedBrown} />
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

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

      {/* General Check Modal (Quick Check) */}
      <GeneralCheckModal
        visible={generalCheckModalVisible}
        onClose={() => setGeneralCheckModalVisible(false)}
      />

      {/* Medication Modal — Medications & Care opens this; its meds / vaccines /
          preventives tabs cover the whole care surface. */}
      <MedicationModal
        visible={medicationModalVisible}
        onClose={() => setMedicationModalVisible(false)}
        initialTab={medicationTab}
      />

      {/* Weight Modal */}
      <WeightModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
      />
    </ScrollView>
  );
}
