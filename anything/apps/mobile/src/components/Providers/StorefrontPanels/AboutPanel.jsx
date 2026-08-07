import React from "react";
import { View, Text, Linking } from "react-native";
import { Globe, Instagram, Facebook, Map } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import LocationsPanel from "./LocationsPanel";

// About section (Phase-1 shell): the provider's bio + public business links (ProviderLinks,
// moved verbatim from app/service/provider.jsx — this is where a social/IG shop's Instagram
// link lives). For archetypes without a dedicated Locations tab (shop / fallback), locations
// are folded in here (includeLocations) so they are never lost. Always available as a tab.
export default function AboutPanel({
  provider,
  locations = [],
  includeLocations = false,
  t,
}) {
  const hasBio = !!provider?.bio;
  const hasLinks = businessLinks(provider).length > 0;
  const hasLocations = includeLocations && locations.length > 0;

  if (!hasBio && !hasLinks && !hasLocations) {
    return (
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
        {t("storefront.aboutEmpty")}
      </Text>
    );
  }

  return (
    <View>
      {hasBio ? (
        <Text
          style={[
            TYPE.callout,
            {
              color: COLORS.mutedBrown,
              lineHeight: 20,
              marginBottom: SPACING.lg + 2,
            },
          ]}
        >
          {provider.bio}
        </Text>
      ) : null}

      {/* Public business links (ticket 2.20) — tappable; only rendered when present. */}
      <ProviderLinks provider={provider} />

      {hasLocations ? <LocationsPanel locations={locations} /> : null}
    </View>
  );
}

function businessLinks(provider) {
  return [
    { url: provider?.website_url, label: "Website", Icon: Globe },
    { url: provider?.instagram_url, label: "Instagram", Icon: Instagram },
    { url: provider?.facebook_url, label: "Facebook", Icon: Facebook },
    { url: provider?.google_maps_url, label: "Google Maps", Icon: Map },
  ].filter((l) => typeof l.url === "string" && l.url.trim().length > 0);
}

// Public business links (ticket 2.20). Renders only the links that exist (no fake/empty
// rows); each opens externally via Linking. The provider profile is public, so these are
// safe to surface read-only.
function ProviderLinks({ provider }) {
  const links = businessLinks(provider);

  if (links.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm + 2, marginBottom: SPACING.lg + 2 }}>
      {links.map(({ url, label, Icon }) => (
        <PressableScale
          key={label}
          onPress={() => Linking.openURL(url.trim())}
          accessibilityRole="link"
          accessibilityLabel={label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.chip,
            paddingHorizontal: SPACING.md,
            paddingVertical: 7,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Icon size={15} color={COLORS.coral} />
          <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.warmBrown }]}>
            {label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
