// Opening a training item (blank-screen bug). iOS cannot present a second sibling <Modal> while one
// is already up: it ignores the request, so tapping a session did nothing, and closing the program
// list then revealed the orphaned session modal with no content. Jest renders every <Modal> happily,
// so these tests pin the structure that iOS needs: ONE visible modal, and the session inside it.
import React from "react";
import { Modal } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";
import { TRAINING_PROGRAMS } from "@/data/trainingCurriculum";
import { COLORS } from "@/constants/colors";

let mockLang;
let mockProgress;
let mockPet;
let mockToggle;

jest.mock("react-i18next", () => {
  const { makeReactI18nextMock } = require("@/i18n/testMock");
  const mocks = { en: makeReactI18nextMock("en"), es: makeReactI18nextMock("es") };
  return { useTranslation: () => mocks[mockLang].useTranslation() };
});
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Services/ServicesDiscovery", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockPet,
}));
jest.mock("@/hooks/useSelfTraining", () => ({
  useSelfTrainingProgress: () => mockProgress,
  useToggleSession: () => mockToggle,
}));

import TrainingScreen from "./training";

const catalogs = {
  en: require("@/i18n/locales/en.json"),
  es: require("@/i18n/locales/es.json"),
};

const program = TRAINING_PROGRAMS[1]; // Basic Obedience
const session = program.sessions[0]; // Sit

const visibleModals = (screen) =>
  screen.UNSAFE_queryAllByType(Modal).filter((m) => m.props.visible);

const openSit = (screen) => {
  fireEvent.press(screen.getByTestId(`program-${program.key}`));
  fireEvent.press(screen.getByTestId(`session-${session.key}`));
};

beforeEach(() => {
  mockLang = "en";
  mockProgress = { completedSet: new Set(), data: [], refetch: jest.fn() };
  mockPet = { data: { id: 1, name: "Rex" }, refetch: jest.fn() };
  mockToggle = { mutate: jest.fn(), isPending: false };
});

describe("one native modal for the whole curriculum", () => {
  test("a session opens inside the program modal, never as a second sibling modal", () => {
    const screen = render(<TrainingScreen />);
    openSit(screen);

    const open = visibleModals(screen);
    expect(open).toHaveLength(1);
    const detail = within(open[0]).getByTestId("session-detail");
    expect(within(detail).getByText(session.steps[0])).toBeTruthy();
  });

  test("the modal behind the content is cream, never the default white", () => {
    const screen = render(<TrainingScreen />);
    openSit(screen);
    expect(visibleModals(screen)[0].props.backdropColor).toBe(COLORS.cream);
  });

  test("closing a session returns to the list; closing the list leaves nothing on screen", () => {
    const screen = render(<TrainingScreen />);
    openSit(screen);

    fireEvent.press(screen.getByTestId("session-close"));
    expect(screen.queryByTestId("session-detail")).toBeNull();
    expect(visibleModals(screen)).toHaveLength(1);

    fireEvent.press(screen.getByTestId("program-back"));
    expect(visibleModals(screen)).toHaveLength(0);
  });

  test("the program list keeps its content while it slides away (no empty sheet)", () => {
    const screen = render(<TrainingScreen />);
    fireEvent.press(screen.getByTestId(`program-${program.key}`));
    fireEvent.press(screen.getByTestId("program-back"));

    // iOS keeps rendering a closing modal's children until the dismiss animation ends. The jest
    // Modal drops them at once, so render what the closing modal was handed.
    const [modal] = screen.UNSAFE_queryAllByType(Modal);
    expect(modal.props.visible).toBe(false);
    const sliding = render(modal.props.children);
    expect(sliding.getByTestId(`session-${session.key}`)).toBeTruthy();
  });

  test("the system back gesture steps back one level at a time", () => {
    const screen = render(<TrainingScreen />);
    openSit(screen);
    const { act } = require("@testing-library/react-native");

    act(() => visibleModals(screen)[0].props.onRequestClose());
    expect(screen.queryByTestId("session-detail")).toBeNull();
    expect(visibleModals(screen)).toHaveLength(1);

    act(() => visibleModals(screen)[0].props.onRequestClose());
    expect(visibleModals(screen)).toHaveLength(0);
  });

  test("the same item opens again and again", () => {
    const screen = render(<TrainingScreen />);
    for (let i = 0; i < 3; i += 1) {
      openSit(screen);
      expect(
        within(screen.getByTestId("session-detail")).getByText(session.steps[0]),
      ).toBeTruthy();
      fireEvent.press(screen.getByTestId("session-close"));
      fireEvent.press(screen.getByTestId("program-back"));
    }
  });
});

describe.each(["en", "es"])("every training item has content (%s)", (lang) => {
  const copy = catalogs[lang].trainingUi.programs;

  test.each(TRAINING_PROGRAMS.map((p) => [p.key, p]))(
    "%s: each session shows its title, objective, steps and tips",
    (_key, p) => {
      mockLang = lang;
      const screen = render(<TrainingScreen />);
      fireEvent.press(screen.getByTestId(`program-${p.key}`));
      expect(p.sessions.length).toBeGreaterThan(0);

      for (const s of p.sessions) {
        const text = copy[p.key].sessions[s.key];
        fireEvent.press(screen.getByTestId(`session-${s.key}`));
        expect(visibleModals(screen)).toHaveLength(1);
        const detail = within(screen.getByTestId("session-detail"));

        expect(detail.getByText(text.title)).toBeTruthy();
        expect(detail.getByText(`🎯 ${text.objective}`, { exact: false })).toBeTruthy();
        expect(s.steps.length).toBeGreaterThan(0);
        s.steps.forEach((_step, i) =>
          expect(detail.getByText(text.steps[i + 1])).toBeTruthy(),
        );
        (s.tips || []).forEach((_tip, i) =>
          expect(detail.getByText(text.tips[i + 1])).toBeTruthy(),
        );
        expect(detail.getByTestId("toggle-complete")).toBeTruthy();

        fireEvent.press(screen.getByTestId("session-close"));
      }
    },
  );
});

describe("progress loading and failure", () => {
  const en = () => catalogs.en.screensUi.training;

  test("while progress loads the lesson shows, with a spinner instead of a made-up count", () => {
    mockProgress = { completedSet: new Set(), isLoading: true, refetch: jest.fn() };
    const screen = render(<TrainingScreen />);
    expect(screen.getByText(en().loadingProgress)).toBeTruthy();
    expect(screen.queryByTestId("overall-progress")).toBeNull();
    expect(screen.queryByText(/sessions done/)).toBeNull();

    openSit(screen);
    const detail = within(screen.getByTestId("session-detail"));
    expect(detail.getByText(session.steps[0])).toBeTruthy();
    expect(detail.getByTestId("progress-loading")).toBeTruthy();
    expect(detail.queryByTestId("toggle-complete")).toBeNull();
  });

  test("a failed load says so and retries, and the lesson is still readable", () => {
    mockProgress = { completedSet: new Set(), isError: true, refetch: jest.fn() };
    const screen = render(<TrainingScreen />);
    expect(screen.getByText(en().progressLoadFailed)).toBeTruthy();
    expect(screen.queryByTestId("overall-progress")).toBeNull();

    openSit(screen);
    const detail = within(screen.getByTestId("session-detail"));
    expect(detail.getByText(session.steps[0])).toBeTruthy();
    expect(detail.queryByTestId("toggle-complete")).toBeNull();
    fireEvent.press(detail.getByTestId("progress-error-retry"));
    expect(mockProgress.refetch).toHaveBeenCalledTimes(1);
  });

  test("a request paused for lack of network is a failure, not zero progress", () => {
    mockProgress = { completedSet: new Set(), fetchStatus: "paused", refetch: jest.fn() };
    const screen = render(<TrainingScreen />);
    expect(screen.getByTestId("progress-error")).toBeTruthy();
    expect(screen.queryByTestId("overall-progress")).toBeNull();
  });

  test("when the pet itself fails to load, retry reloads the pet", () => {
    mockPet = { data: null, isError: true, refetch: jest.fn() };
    mockProgress = { completedSet: new Set(), refetch: jest.fn() };
    const screen = render(<TrainingScreen />);
    fireEvent.press(screen.getByTestId("progress-error-retry"));
    expect(mockPet.refetch).toHaveBeenCalledTimes(1);
    expect(mockProgress.refetch).not.toHaveBeenCalled();
  });

  test("progress already on screen stays when a later refresh fails", () => {
    mockProgress = { completedSet: new Set(), data: [], isError: true, refetch: jest.fn() };
    const screen = render(<TrainingScreen />);
    expect(screen.queryByTestId("progress-error")).toBeNull();
    expect(screen.getByTestId("overall-progress")).toBeTruthy();
  });
});
