// Ticket 2.41 + AI-2 (night-run 2026-08-18d) — owner adds a Vet Record document: pick a photo +
// name → upload → POST /api/vet-record/documents → refetch → THEN read it (AI-1 /extract) and, per
// outcome, show "Reading…", a dormant/empty status, or the review sheet. Native deps are mocked;
// the review sheet is stubbed so this file focuses on the upload + extract-routing behavior.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockUpload = jest.fn();
const mockLaunch = jest.fn();
const mockCamera = jest.fn();
const mockPickFile = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Resolve dotted i18n keys against the real English resources so assertions read English.
jest.mock("react-i18next", () => {
  const en = require("@/i18n/locales/en.json");
  const resolve = (key) =>
    key.split(".").reduce((o, k) => (o == null ? o : o[k]), en);
  return {
    useTranslation: () => ({
      t: (key) => {
        const v = resolve(key);
        return typeof v === "string" ? v : key;
      },
    }),
  };
});
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: () =>
    Promise.resolve({ granted: true }),
  requestCameraPermissionsAsync: () => Promise.resolve({ granted: true }),
  launchImageLibraryAsync: (...args) => mockLaunch(...args),
  launchCameraAsync: (...args) => mockCamera(...args),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args) => mockPickFile(...args),
}));
const mockResolveSize = jest.fn();
jest.mock("@/utils/downscaleImageAsset", () => ({
  DOCUMENT_UPLOAD_OPTIONS: { maxEdge: 2200, quality: 0.8 },
  resolveImageSize: (...args) => mockResolveSize(...args),
}));
jest.mock("@/utils/useUpload", () => ({
  useUpload: () => [mockUpload, { loading: false }],
}));
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { ScrollView } = require("react-native");
  return (props) => <ScrollView {...props} />;
});
jest.mock("@/utils/dateUtils", () => ({
  getLocalPostDateString: () => "2026-06-18",
}));
// Stub the review sheet — its own behavior is covered in ReviewProposalModal.test.jsx.
jest.mock("./ReviewProposalModal", () => {
  const { Text } = require("react-native");
  return {
    ReviewProposalModal: ({ visible }) =>
      visible ? <Text testID="review-open">review</Text> : null,
  };
});

import { AddDocumentModal } from "./AddDocumentModal";
import { DOCUMENT_UPLOAD_OPTIONS } from "@/utils/downscaleImageAsset";

// Route the two fetches by URL; the extract response is set per-test.
let extractResponse;
const wireFetch = () => {
  global.fetch = jest.fn((url) => {
    if (url === "/api/vet-record/documents/extract") return extractResponse;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
};

// Fill the form and save, picking the paperwork via the given source button (default: library
// photo). `pickResult` overrides what that picker resolves with.
async function fillAndSave({
  source = "doc-choose-photo",
  mock = mockLaunch,
  pickResult = { canceled: false, assets: [{ uri: "file:///paper.jpg" }] },
} = {}) {
  mock.mockResolvedValue(pickResult);
  mockUpload.mockResolvedValue({ url: "https://cdn/paper.jpg" });
  const onSaved = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <AddDocumentModal visible petId={3} onClose={onClose} onSaved={onSaved} />,
  );
  fireEvent.changeText(
    utils.getByPlaceholderText("e.g. Rabies certificate"),
    "Labwork",
  );
  await waitFor(() => fireEvent.press(utils.getByTestId(source)));
  fireEvent.press(utils.getByText("Save document"));
  return { ...utils, onSaved, onClose };
}

beforeEach(() => {
  mockUpload.mockReset();
  mockLaunch.mockReset();
  mockCamera.mockReset();
  mockPickFile.mockReset();
  mockResolveSize.mockReset();
  mockResolveSize.mockResolvedValue({});
  extractResponse = Promise.resolve({ status: 503, ok: false });
  wireFetch();
});

test("renders the add-document form", () => {
  render(
    <AddDocumentModal visible petId={3} onClose={jest.fn()} onSaved={jest.fn()} />,
  );
});

test("uploads + POSTs the document with the owner fields, then refetches", async () => {
  const { onSaved } = await fillAndSave();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockUpload).toHaveBeenCalled();
  const docCall = global.fetch.mock.calls.find(
    (c) => c[0] === "/api/vet-record/documents",
  );
  expect(docCall).toBeTruthy();
  const body = JSON.parse(docCall[1].body);
  expect(body).toMatchObject({
    petId: 3,
    name: "Labwork",
    fileUrl: "https://cdn/paper.jpg",
    documentDate: "2026-06-18",
    category: "vaccine",
  });
  // Then it calls the extract route with the stored file URL.
  await waitFor(() =>
    expect(
      global.fetch.mock.calls.some(
        (c) => c[0] === "/api/vet-record/documents/extract",
      ),
    ).toBe(true),
  );
});

test("dormant extract (503) → honest 'not switched on yet' status", async () => {
  extractResponse = Promise.resolve({ status: 503, ok: false });
  const { getByText } = await fillAndSave();
  await waitFor(() => expect(getByText("Saved to Documents")).toBeTruthy());
});

test("empty proposal → 'we saved your file' status", async () => {
  extractResponse = Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ proposal: { docType: "other", records: {} } }),
  });
  const { getByText } = await fillAndSave();
  await waitFor(() => expect(getByText("File saved")).toBeTruthy());
});

test("a proposal with records → opens the review sheet and dismisses this sheet", async () => {
  extractResponse = Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        proposal: {
          docType: "vaccination_card",
          records: { vaccinations: [{ name: "Rabies" }] },
        },
      }),
  });
  const { getByTestId, onClose } = await fillAndSave();
  await waitFor(() => expect(getByTestId("review-open")).toBeTruthy());
  expect(onClose).toHaveBeenCalled();
});

test("picking a PDF uploads + reads it as application/pdf (not a fake jpg)", async () => {
  const { onSaved } = await fillAndSave({
    source: "doc-choose-file",
    mock: mockPickFile,
    pickResult: {
      canceled: false,
      assets: [
        { uri: "file:///rabies.pdf", name: "rabies.pdf", mimeType: "application/pdf" },
      ],
    },
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());

  // The upload keeps the real PDF name + mimeType.
  const asset = mockUpload.mock.calls[0][0].reactNativeAsset;
  expect(asset).toMatchObject({
    uri: "file:///rabies.pdf",
    name: "rabies.pdf",
    mimeType: "application/pdf",
  });

  // The extract call receives mimeType application/pdf so the AI reads it as a PDF.
  await waitFor(() =>
    expect(
      global.fetch.mock.calls.some(
        (c) => c[0] === "/api/vet-record/documents/extract",
      ),
    ).toBe(true),
  );
  const extractCall = global.fetch.mock.calls.find(
    (c) => c[0] === "/api/vet-record/documents/extract",
  );
  expect(JSON.parse(extractCall[1].body)).toMatchObject({
    mimeType: "application/pdf",
    filename: "rabies.pdf",
  });
});

test("taking a photo with the camera fills the paperwork", async () => {
  const { onSaved } = await fillAndSave({
    source: "doc-take-photo",
    mock: mockCamera,
    pickResult: {
      canceled: false,
      assets: [{ uri: "file:///snap.jpg", mimeType: "image/jpeg" }],
    },
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockCamera).toHaveBeenCalled();
  expect(mockUpload.mock.calls[0][0].reactNativeAsset.uri).toBe("file:///snap.jpg");
});

test("a big library photo is handed to the upload with its pixel size + the document downscale", async () => {
  const { onSaved } = await fillAndSave({
    pickResult: {
      canceled: false,
      assets: [{ uri: "file:///big.jpg", mimeType: "image/jpeg", width: 4032, height: 3024 }],
    },
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());

  const call = mockUpload.mock.calls[0][0];
  expect(call.reactNativeAsset).toMatchObject({ uri: "file:///big.jpg", width: 4032, height: 3024 });
  expect(call.downscale).toEqual(DOCUMENT_UPLOAD_OPTIONS);
  expect(call).toMatchObject({ visibility: "private", petId: 3 });
});

test("an image picked as a file (no size from the picker) has its size resolved so it is still downscaled", async () => {
  mockResolveSize.mockResolvedValue({ width: 4032, height: 3024 });
  const { onSaved } = await fillAndSave({
    source: "doc-choose-file",
    mock: mockPickFile,
    pickResult: {
      canceled: false,
      assets: [{ uri: "file:///scan.jpg", name: "scan.jpg", mimeType: "image/jpeg" }],
    },
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());

  expect(mockResolveSize).toHaveBeenCalledWith("file:///scan.jpg");
  expect(mockUpload.mock.calls[0][0].reactNativeAsset).toMatchObject({ width: 4032, height: 3024 });
});

test("a PDF is never size-resolved", async () => {
  const { onSaved } = await fillAndSave({
    source: "doc-choose-file",
    mock: mockPickFile,
    pickResult: {
      canceled: false,
      assets: [{ uri: "file:///r.pdf", name: "r.pdf", mimeType: "application/pdf" }],
    },
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockResolveSize).not.toHaveBeenCalled();
});

test("if saving the document row fails, a retry reuses the stored file instead of uploading a second copy", async () => {
  const Alert = require("react-native").Alert;
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  let docCalls = 0;
  global.fetch = jest.fn((url) => {
    if (url === "/api/vet-record/documents") {
      docCalls += 1;
      return docCalls === 1
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    return extractResponse;
  });
  const { onSaved, getByText } = await fillAndSave();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled()); // first attempt fails visibly
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();

  fireEvent.press(getByText("Save document"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockUpload).toHaveBeenCalledTimes(1); // no second upload
  expect(docCalls).toBe(2);
});
