import React from "react";
import { Text } from "react-native";
import { MapPin, Phone } from "lucide-react-native";
import { Card } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { Section, Row } from "./primitives";

// Locations section (moved verbatim from app/service/provider.jsx). Presentational: takes the
// already-fetched locations. Renders nothing when there are none.
export default function LocationsPanel({ locations = [] }) {
  if (locations.length === 0) return null;
  return (
    <Section title="Locations">
      {locations.map((l) => (
        <Card
          key={l.id}
          level="sm"
          radius={RADIUS.md}
          style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
        >
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>{l.name}</Text>
          {l.address ? (
            <Row icon={<MapPin size={13} color={COLORS.mutedBrown} />}>
              {l.address}
            </Row>
          ) : null}
          {l.phone ? (
            <Row icon={<Phone size={13} color={COLORS.mutedBrown} />}>
              {l.phone}
            </Row>
          ) : null}
        </Card>
      ))}
    </Section>
  );
}
