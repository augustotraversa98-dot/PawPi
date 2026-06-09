import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import { COLORS } from "@/constants/colors";
import { useRefresh } from "@/hooks/useRefresh";

/**
 * A ScrollView pre-wired with pull-to-refresh. Swap a plain `<ScrollView>` for
 * `<RefreshableScrollView refetch={fn}>` to opt a screen in — all other
 * ScrollView props are forwarded unchanged.
 *
 * @param {Function|Array<Function>} refetch refetch fn(s) the pull re-triggers
 * @param {string} [tintColor] spinner color (defaults to the app coral)
 */
export function RefreshableScrollView({
  refetch,
  tintColor = COLORS.coral,
  children,
  ...scrollViewProps
}) {
  const { refreshing, onRefresh } = useRefresh(refetch);
  return (
    <ScrollView
      {...scrollViewProps}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tintColor}
          colors={[tintColor]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
