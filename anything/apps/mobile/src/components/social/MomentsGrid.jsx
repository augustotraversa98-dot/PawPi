import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";

const { width: SCREEN_W } = Dimensions.get("window");
// 3-up grid: full width minus the two SPACING.lg page gutters (16 each) minus the two
// inter-tile gaps (SPACING.xs = 4 each), divided by three. Matches pet-profile's original math.
const TILE = (SCREEN_W - 32 - 8) / 3;

// Shared "daily moments" image grid — the pet social profile and the business storefront show
// the SAME 3-up tile grid so posts read as a gallery, not a flat list. Presentational only.
//
// `moments`: [{ id, imageUri?, body?, badge? }]
//   • imageUri — when set, the tile is that image; otherwise it's a text tile (body preview),
//     so text-only business posts stay reachable.
//   • badge — optional { icon, count } rendered as a dark pill bottom-left (pet: paws;
//     business: comments).
// `onOpen(moment)` opens the detail. `isLoading` shows a spinner while the first page loads.
// `empty` is the caller's own empty-state node (each screen keeps its own copy), rendered when
// there are no moments and nothing is loading. `tileTestID` tags each tappable tile.
export function MomentsGrid({
  moments = [],
  onOpen,
  isLoading = false,
  empty = null,
  tileTestID,
}) {
  if (isLoading && moments.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  if (moments.length === 0) {
    return empty;
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs }}>
      {moments.map((m) => (
        <TouchableOpacity
          key={m.id}
          testID={tileTestID}
          activeOpacity={0.88}
          onPress={() => onOpen?.(m)}
          style={{ position: "relative" }}
        >
          {m.imageUri ? (
            <Image
              source={{ uri: m.imageUri }}
              style={{
                width: TILE,
                height: TILE,
                borderRadius: RADIUS.control,
                backgroundColor: MATERIALS.surfaceSunken,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: TILE,
                height: TILE,
                borderRadius: RADIUS.control,
                backgroundColor: COLORS.sand,
                borderWidth: 1,
                borderColor: COLORS.peach,
                padding: SPACING.sm,
                justifyContent: "center",
              }}
            >
              <Text
                numberOfLines={5}
                style={[TYPE.caption, { color: COLORS.warmBrown, lineHeight: 15 }]}
              >
                {m.body || ""}
              </Text>
            </View>
          )}

          {m.badge ? (
            <View
              style={{
                position: "absolute",
                bottom: SPACING.xs + 2,
                left: SPACING.xs + 2,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(59,36,27,0.6)",
                borderRadius: RADIUS.chip,
                paddingHorizontal: 7,
                paddingVertical: 3,
                gap: 3,
              }}
            >
              {m.badge.icon}
              <Text
                style={[
                  TYPE.caption,
                  { color: "#FFF", fontWeight: "700", letterSpacing: 0 },
                ]}
              >
                {m.badge.count}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default MomentsGrid;
