import React from "react";
import { useLocalSearchParams } from "expo-router";
import ServicesDiscovery from "@/components/Services/ServicesDiscovery";

// Pushed /service/discover screen: the unified Services discovery UX with a back arrow.
// The full body lives in ServicesDiscovery (shared with the Services TAB LANDING). A
// ?category=<key> deep link pre-applies a chip (aliases resolve legacy keys).
export default function DiscoverScreen() {
  const params = useLocalSearchParams();
  return (
    <ServicesDiscovery
      variant="screen"
      initialCategory={
        typeof params.category === "string" ? params.category : undefined
      }
    />
  );
}
