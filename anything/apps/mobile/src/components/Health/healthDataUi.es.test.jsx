// Spanish (es-AR) render of the Health leftovers that used to ship English: the walker live-map notes, the
// countdown-card action labels, and the medical-profile spay/neuter + gender options. Stored option values
// ("Spayed", "female", ...) must stay as they were; only the visible label localizes.
import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/Map/MapLocationView", () => () => null);

import WalkerLiveMap from "./WalkActivity/WalkerLiveMap";
import CountdownCard from "./Reminders/CountdownCard";
import EditMedicalProfileModal from "./VetRecord/EditMedicalProfileModal";
import ScheduleBlock, { scheduleFromItem } from "./Reminders/ScheduleBlock";
import { SPAY_NEUTER_OPTIONS } from "@/utils/healthText";

test("WalkerLiveMap notes are in Spanish", () => {
  const waiting = render(<WalkerLiveMap points={[]} />);
  expect(waiting.getByText("Esperando los primeros puntos de GPS…")).toBeTruthy();
  const denied = render(<WalkerLiveMap points={[]} permissionDenied />);
  expect(denied.getByText(/La ubicación está desactivada para este paseo/)).toBeTruthy();
});

test("CountdownCard shows Spanish action labels", () => {
  const reminder = {
    id: "r1",
    type: "medical_care",
    careType: "vaccine",
    title: "Vacuna",
    description: "",
    timeSensitive: true,
    scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  const api = render(<CountdownCard reminder={reminder} onComplete={jest.fn()} onSnooze={jest.fn()} />);
  expect(api.getByText("ALERTA URGENTE")).toBeTruthy();
  expect(api.getByText("Marcar como completado")).toBeTruthy();
  expect(api.queryByText("TIME-SENSITIVE")).toBeNull();
  expect(api.queryByText("Mark completed")).toBeNull();

  const med = render(
    <CountdownCard
      reminder={{ ...reminder, careType: "medication" }}
      onComplete={jest.fn()}
      onSnooze={jest.fn()}
      onSomethingOff={jest.fn()}
    />,
  );
  expect(med.getByText("Algo no estuvo bien")).toBeTruthy();
});

test("EditMedicalProfileModal shows Spanish spay/neuter + gender labels; stored ids stay English", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = render(
    <QueryClientProvider client={client}>
      <EditMedicalProfileModal visible petId={1} initialData={{ pet: {} }} onClose={jest.fn()} />
    </QueryClientProvider>,
  );
  for (const label of ["Esterilizada", "Castrado", "Sin castrar/esterilizar", "Desconocido", "Macho", "Hembra"]) {
    expect(api.getByText(label)).toBeTruthy();
  }
  expect(api.queryByText("Male")).toBeNull();
  expect(api.queryByText("Spayed")).toBeNull();
  expect(SPAY_NEUTER_OPTIONS).toEqual(["Spayed", "Neutered", "Not spayed/neutered", "Unknown"]);
});

test("ScheduleBlock's collapsed Frequency header is Spanish (was the English CADENCE_LABELS)", () => {
  const value = scheduleFromItem({ frequency: "weekly", startDate: "2026-06-10", days: [2] });
  const api = render(<ScheduleBlock value={value} onChange={jest.fn()} />);
  expect(api.getByText("Semanal")).toBeTruthy();
  expect(api.queryByText("Weekly")).toBeNull();
});
