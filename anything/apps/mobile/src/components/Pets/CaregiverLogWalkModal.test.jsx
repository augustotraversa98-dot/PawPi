// FF2 — the family-caregiver "Log a walk" sheet for a SHARED pet. Proves it posts to
// /api/health/walk-logs with the shared petId (the server anchors the write to the owner).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));

import CaregiverLogWalkModal from "./CaregiverLogWalkModal";

function renderWithClient(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ log: { id: 1 } }) }),
  );
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("submitting posts the walk for the shared petId and closes", async () => {
  const onClose = jest.fn();
  const { getByTestId } = renderWithClient(
    <CaregiverLogWalkModal visible petId={5} petName="Rex" onClose={onClose} />,
  );

  fireEvent.changeText(getByTestId("caregiver-log-walk-duration"), "25");
  fireEvent.press(getByTestId("caregiver-log-walk-save"));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe("/api/health/walk-logs");
  expect(opts.method).toBe("POST");
  const body = JSON.parse(opts.body);
  expect(body).toMatchObject({ petId: 5, durationMinutes: 25 });

  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
