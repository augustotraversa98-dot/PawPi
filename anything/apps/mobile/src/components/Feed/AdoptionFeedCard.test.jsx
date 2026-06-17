// Ticket 2.30 — the "Adopt me" feed card forwards a press with its listing so the feed
// can deep-link into that exact dog (the param mapping lives in the feed screen).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});

import { AdoptionFeedCard } from "./AdoptionFeedCard";

test("tapping the card calls onPress (the feed maps the listing → deep-link params)", () => {
  const onPress = jest.fn();
  const listing = {
    id: 5,
    provider_id: 3,
    name: "Rex",
    breed: "Lab",
    photo_urls: ["https://x/p.png"],
    adoption_fee_cents: 0,
  };
  const { getByTestId } = render(
    <AdoptionFeedCard listing={listing} onPress={onPress} />,
  );
  fireEvent.press(getByTestId("adoption-feed-card"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
