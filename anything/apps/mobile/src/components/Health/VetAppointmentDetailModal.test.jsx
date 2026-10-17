// Flow audit F3-04: a booking made with a business is completed BY the business (that unlocks the
// review). The owner's "Mark completed" is only for personal vet appointments.
import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/Providers/WriteReviewModal", () => () => null);

import VetAppointmentDetailModal from "./VetAppointmentDetailModal";

const base = {
  id: 1,
  title: "Checkup",
  appointment_date: "2026-10-20",
  appointment_time: "09:30:00",
  status: "scheduled",
  pet_id: 1,
};
const renderModal = (appointment) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VetAppointmentDetailModal visible onClose={jest.fn()} appointment={appointment} />
    </QueryClientProvider>,
  );

describe("VetAppointmentDetailModal — Mark completed", () => {
  test("shown for a personal vet appointment", () => {
    const api = renderModal({ ...base, provider_id: null });
    expect(api.queryByText("Mark Completed") || api.queryByText("Mark completed") || api.queryByText(/Mark/i)).toBeTruthy();
  });

  test("hidden for a booking made with a business (the business completes it)", () => {
    const api = renderModal({ ...base, provider_id: 5 });
    expect(api.queryByText(/mark completed/i)).toBeNull();
  });
});
