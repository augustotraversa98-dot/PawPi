// Persistence proof for the Registrar "Chequeo con fotos" flow (Part 2). PhotoCheckCaptureModal
// is the SINGLE working write path (also used by the Hoy tab): pick a photo → upload it PRIVATELY,
// scoped to the current pet → POST /api/health/photo-checks so it lands in Photo History via the
// auth-gated streamer. This test drives gallery → save and asserts the upload is private + pet-scoped
// and the POST fires with the right body — the exact behaviour the old HealthTrack stub was missing.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

// Gallery pick returns a local asset; permission granted.
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///tmp/ears.jpg" }],
  })),
  MediaTypeOptions: { Images: "Images" },
}));

// The private-upload hook — returns a KEY (A-04), the shape the modal stores in image_url.
const mockUploadFn = jest.fn(async () => ({ key: "pet-7/photo_check_ears_123.jpg" }));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [mockUploadFn, { loading: false }],
}));

// Mutable so a test can drop the current pet without re-mocking the module.
const mockPetState = { data: { id: 7, name: "Mango" } };
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockPetState,
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/hooks/useHealthReinforcement", () => ({
  invalidateHealthGraph: jest.fn(),
}));

import PhotoCheckCaptureModal from "./PhotoCheckCaptureModal";

let fetchSpy;
beforeEach(() => {
  mockPetState.data = { id: 7, name: "Mango" };
  mockUploadFn.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
});
afterEach(() => {
  fetchSpy.mockRestore();
  jest.restoreAllMocks();
});

test("picking a photo and saving uploads it PRIVATELY (pet-scoped) and POSTs the photo check", async () => {
  const onClose = jest.fn();
  const { getByText } = render(
    <PhotoCheckCaptureModal visible bodyArea="ears" onClose={onClose} />,
  );

  // Choose from Gallery → advances to the notes step (Save button appears).
  fireEvent.press(getByText("Choose from Gallery"));
  await waitFor(() => expect(getByText("Save Photo Check")).toBeTruthy());

  // Save → upload (private + petId) then POST.
  fireEvent.press(getByText("Save Photo Check"));

  await waitFor(() => expect(mockUploadFn).toHaveBeenCalledTimes(1));
  expect(mockUploadFn).toHaveBeenCalledWith(
    expect.objectContaining({ visibility: "private", petId: 7 }),
  );

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  const [url, opts] = fetchSpy.mock.calls[0];
  expect(url).toBe("/api/health/photo-checks");
  expect(opts.method).toBe("POST");
  const body = JSON.parse(opts.body);
  expect(body).toMatchObject({
    petId: 7,
    bodyArea: "ears",
    imageUrl: "pet-7/photo_check_ears_123.jpg", // the private KEY, not a device file:// URI
  });

  // Closes on success (state reset for next open).
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

test("save is blocked with no current pet (never POSTs a rootless photo check)", async () => {
  mockPetState.data = null;
  const { getByText } = render(<PhotoCheckCaptureModal visible bodyArea="ears" onClose={jest.fn()} />);
  fireEvent.press(getByText("Choose from Gallery"));
  await waitFor(() => expect(getByText("Save Photo Check")).toBeTruthy());
  fireEvent.press(getByText("Save Photo Check"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(mockUploadFn).not.toHaveBeenCalled();
});
