// PackFriendPicker — "Streak with a friend" typeahead (night run #2, PR C).
//
// Replaces the free-text @handle field. As the person types (debounced) it shows matching FRIENDS —
// by pet name, @handle or owner name — each with avatar, pet name, @handle and owner name (never an
// e-mail). Selecting a row stores that friend; text that doesn't resolve to a selected friend can't
// be submitted (a friendly hint explains). Empty states: "No friends yet" (with a path to find
// friends) and "No friends match".

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { useDebouncedValue } from "@/hooks/useSearch";
import { usePackFriends } from "@/hooks/usePackFriends";
import { COLORS } from "@/constants/colors";

const DEBOUNCE_MS = 250;

export function FriendRow({ friend, onPress, disabledLabel, testID }) {
  const { t } = useTranslation();
  const disabled = !!disabledLabel;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : () => onPress(friend)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${friend.name} @${friend.handle}`}
      style={[styles.row, disabled && { opacity: 0.55 }]}
    >
      <PetAvatar uri={friend.avatar_url || undefined} name={friend.name} size={40} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {friend.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          @{friend.handle} · {friend.owner_name || t("common.petParent")}
        </Text>
      </View>
      {disabled ? <Text style={styles.badge}>{disabledLabel}</Text> : null}
    </Pressable>
  );
}

export default function PackFriendPicker({
  petId,
  selected,
  onSelect,
  onClear,
  onFindFriends,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const q = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const { data: friends = [], isLoading, isError, refetch } = usePackFriends(petId, q, {
    enabled: open && !selected,
  });

  if (selected) {
    return (
      <View style={styles.selected} testID="pack-friend-selected">
        <PetAvatar uri={selected.avatar_url || undefined} name={selected.name} size={36} />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {t("packStreaks.streakWith", { name: selected.name })}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            @{selected.handle}
          </Text>
        </View>
        <Pressable
          onPress={onClear}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t("packStreaks.clearFriend")}
          hitSlop={10}
          style={styles.clear}
        >
          <X size={18} color={COLORS.mutedBrown} />
        </Pressable>
      </View>
    );
  }

  const typing = text.trim().length > 0;
  const showList = open || typing;
  const settling = typing && q !== text.trim();

  const statusLabel = (s) =>
    s === "pending" ? t("packStreaks.status_pending") : s === "active" ? t("packStreaks.status_active") : s === "ended" ? t("packStreaks.status_ended") : "";

  return (
    <View>
      <TextInput
        testID="pack-friend-input"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("packStreaks.pickerPlaceholder")}
        placeholderTextColor={COLORS.mutedBrown}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        style={styles.input}
        accessibilityLabel={t("packStreaks.pickerPlaceholder")}
      />
      {showList ? (
        <View style={styles.list} testID="pack-friend-list">
          {isLoading || settling ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={COLORS.mutedBrown} />
          ) : isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyBody}>{t("packStreaks.loadFailed")}</Text>
              <Pressable onPress={() => refetch()} accessibilityRole="button" style={styles.link}>
                <Text style={styles.linkText}>{t("packStreaks.retry")}</Text>
              </Pressable>
            </View>
          ) : friends.length === 0 ? (
            typing ? (
              <View style={styles.empty} testID="pack-friend-no-match">
                <Text style={styles.emptyTitle}>{t("packStreaks.noMatch")}</Text>
              </View>
            ) : (
              <View style={styles.empty} testID="pack-friend-none-yet">
                <Text style={styles.emptyTitle}>{t("packStreaks.noFriendsYet")}</Text>
                <Text style={styles.emptyBody}>{t("packStreaks.noFriendsBody")}</Text>
                {onFindFriends ? (
                  <Pressable onPress={onFindFriends} accessibilityRole="button" style={styles.link} testID="pack-find-friends">
                    <Text style={styles.linkText}>{t("packStreaks.findFriends")}</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          ) : (
            friends.map((f) => (
              <FriendRow
                key={f.id}
                friend={f}
                testID={`pack-friend-${f.id}`}
                disabledLabel={f.pack_status && f.pack_status !== "none" ? statusLabel(f.pack_status) : ""}
                onPress={(friend) => {
                  setText("");
                  setOpen(false);
                  onSelect(friend);
                }}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.sand,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    color: COLORS.warmBrown,
    fontSize: 14,
  },
  list: { marginTop: 6, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.peach },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, minHeight: 56 },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "700", color: COLORS.warmBrown },
  rowSub: { marginTop: 1, fontSize: 12, color: COLORS.mutedBrown },
  badge: { fontSize: 11, fontWeight: "700", color: COLORS.terracotta },
  empty: { padding: 14, alignItems: "flex-start" },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: COLORS.warmBrown },
  emptyBody: { marginTop: 4, fontSize: 13, color: COLORS.mutedBrown, lineHeight: 18 },
  link: { marginTop: 8, minHeight: 44, justifyContent: "center" },
  linkText: { fontSize: 14, fontWeight: "800", color: COLORS.coral },
  selected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.sand,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.coral,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 52,
  },
  clear: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
