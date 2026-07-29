import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { GlassSurface, PressableScale } from "@/components/ui";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import LocationField from "@/components/Map/LocationField";
import { useCreateEvent } from "@/hooks/useEvents";

// Create an event / meetup (ticket 2.74). Title + description + date/time (canonical DateField/
// TimeField) + location via the 2.68 LocationField (Apple map) + optional capacity. The host is the
// caller (server-side). Real data only.
export default function EventCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const create = useCreateEvent();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState(null); // { lat, lng, address }
  const [capacity, setCapacity] = useState("");

  const canSubmit = title.trim() && date && time;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const startsAt = new Date(`${date}T${time}:00`).toISOString();
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        starts_at: startsAt,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        location_name: location?.address ?? null,
        address: location?.address ?? null,
        capacity: capacity ? Number(capacity) : null,
      });
      router.back();
    } catch (e) {
      Alert.alert(t("events.couldNotCreate"), e.message || "");
    }
  };

  const inputStyle = {
    backgroundColor: MATERIALS.surfaceSunken,
    borderWidth: 1,
    borderColor: MATERIALS.hairline,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPE.callout,
    color: COLORS.warmBrown,
    marginBottom: SPACING.md,
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          {t("events.createTitle")}
        </Text>
      </GlassSurface>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <TextInput
          testID="event-title"
          value={title}
          onChangeText={setTitle}
          placeholder={t("events.titlePlaceholder")}
          placeholderTextColor={COLORS.mutedBrown}
          style={inputStyle}
        />
        <TextInput
          testID="event-description"
          value={description}
          onChangeText={setDescription}
          placeholder={t("events.descPlaceholder")}
          placeholderTextColor={COLORS.mutedBrown}
          multiline
          style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
        />

        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <View style={{ flex: 1 }}>
            <DateField testID="event-date" value={date} onChange={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField testID="event-time" value={time} onChange={setTime} />
          </View>
        </View>

        <View style={{ marginTop: SPACING.md, marginBottom: SPACING.md }}>
          <LocationField
            testID="event-location"
            label={t("events.location")}
            value={location}
            onChange={setLocation}
          />
        </View>

        <TextInput
          testID="event-capacity"
          value={capacity}
          onChangeText={setCapacity}
          placeholder={t("events.capacity")}
          placeholderTextColor={COLORS.mutedBrown}
          keyboardType="number-pad"
          style={inputStyle}
        />

        <PressableScale
          testID="event-submit"
          onPress={submit}
          disabled={!canSubmit || create.isPending}
          style={{
            backgroundColor: canSubmit ? COLORS.coral : COLORS.peach,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.md,
            alignItems: "center",
            opacity: create.isPending ? 0.6 : 1,
            marginTop: SPACING.xs,
          }}
        >
          <Text style={[TYPE.headline, { color: "#fff", fontWeight: "800" }]}>
            {t("events.publish")}
          </Text>
        </PressableScale>
      </ScrollView>
    </View>
  );
}
