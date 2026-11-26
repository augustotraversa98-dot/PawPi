import { Platform, Share } from "react-native";

const mockFiles = [];
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache/" },
  File: jest.fn().mockImplementation((dir, name) => {
    const file = {
      uri: `${dir}${name}`,
      exists: false,
      delete: jest.fn(),
      create: jest.fn(),
      write: jest.fn(),
    };
    mockFiles.push(file);
    return file;
  }),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import * as Sharing from "expo-sharing";
import { buildQrSharePayload, qrFileName, qrToBase64, shareQrImage, QR_EXPORT_PIXELS } from "./emergencyQrShare";

const es = require("@/i18n/locales/es.json");
const t = (key, vars = {}) =>
  key
    .split(".")
    .reduce((o, p) => o[p], es)
    .replace(/\{\{(\w+)\}\}/g, (m, n) => vars[n]);
const URL_ = "https://www.pawpi.info/p/tag/TOK";
const svg = { toDataURL: jest.fn((cb) => cb("aGVs\nbG8=\n")) };

let platform;
beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.length = 0;
  platform = Platform.OS;
});
afterEach(() => {
  Platform.OS = platform;
});

test("the file name is safe for any dog name", () => {
  expect(qrFileName("Ñandú Pérez!")).toBe("pawpi-qr-nandu-perez.png");
  expect(qrFileName("../../etc")).toBe("pawpi-qr-etc.png");
  expect(qrFileName("🐶")).toBe("pawpi-qr.png");
  expect(qrFileName(null)).toBe("pawpi-qr.png");
});

test("the share text is localized and carries the link", () => {
  expect(buildQrSharePayload({ petName: "Busdy", url: URL_, t })).toEqual({
    fileName: "pawpi-qr-busdy.png",
    title: "QR de la chapa PawPi de Busdy",
    message: `Código QR de la chapa PawPi de Busdy. Enlace:\n${URL_}`,
  });
});

test("the QR is exported large, as bare base64", async () => {
  await expect(qrToBase64(svg)).resolves.toBe("aGVsbG8=");
  expect(svg.toDataURL.mock.calls[0][1]).toEqual({ width: QR_EXPORT_PIXELS, height: QR_EXPORT_PIXELS });
});

test("a QR that is not ready or comes out empty is an error", async () => {
  await expect(qrToBase64(null)).rejects.toThrow();
  await expect(qrToBase64({ toDataURL: (cb) => cb("") })).rejects.toThrow();
});

test("iOS shares the PNG file together with the link text", async () => {
  Platform.OS = "ios";
  const share = jest.spyOn(Share, "share").mockResolvedValue({});
  await shareQrImage({ svg, petName: "Busdy", url: URL_, t });
  expect(mockFiles[0].write).toHaveBeenCalledWith("aGVsbG8=", { encoding: "base64" });
  expect(share.mock.calls[0][0].url).toBe("file:///cache/pawpi-qr-busdy.png");
  expect(share.mock.calls[0][0].message).toContain(URL_);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  share.mockRestore();
});

test("Android shares the PNG through expo-sharing", async () => {
  Platform.OS = "android";
  Sharing.isAvailableAsync.mockResolvedValue(true);
  await shareQrImage({ svg, petName: "Busdy", url: URL_, t });
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    "file:///cache/pawpi-qr-busdy.png",
    expect.objectContaining({ mimeType: "image/png", dialogTitle: expect.stringContaining(URL_) }),
  );
});

test("no share sheet available is reported", async () => {
  Platform.OS = "android";
  Sharing.isAvailableAsync.mockResolvedValue(false);
  await expect(shareQrImage({ svg, petName: "Busdy", url: URL_, t })).rejects.toThrow();
});
