import {
  downscaleImageAsset,
  MAX_UPLOAD_EDGE,
  UPLOAD_JPEG_QUALITY,
  DOCUMENT_UPLOAD_OPTIONS,
} from "./downscaleImageAsset";

const SaveFormat = { JPEG: "jpeg", PNG: "png" };
const run = (asset, manipulate) => downscaleImageAsset(asset, { manipulate, saveFormat: SaveFormat });
const resized = jest.fn(async () => ({ uri: "file:///tmp/small.jpg", width: 1080, height: 1440 }));

beforeEach(() => resized.mockClear());

test("a 12 MP portrait photo is resized to 1440 px on the long edge as a 0.75 JPEG", async () => {
  const asset = { uri: "file:///cam/big.heic", width: 3024, height: 4032, mimeType: "image/heic", type: "image", name: "IMG_1.HEIC" };
  const out = await run(asset, resized);

  expect(resized).toHaveBeenCalledWith(
    "file:///cam/big.heic",
    [{ resize: { height: MAX_UPLOAD_EDGE } }],
    { compress: UPLOAD_JPEG_QUALITY, format: "jpeg" },
  );
  expect(out).toMatchObject({ uri: "file:///tmp/small.jpg", mimeType: "image/jpeg", name: "IMG_1.jpg", width: 1080, height: 1440 });
});

test("landscape resizes by width", async () => {
  await run({ uri: "file:///a.jpg", width: 4032, height: 3024, mimeType: "image/jpeg", type: "image" }, resized);
  expect(resized.mock.calls[0][1]).toEqual([{ resize: { width: MAX_UPLOAD_EDGE } }]);
});

test("an image already small enough is returned untouched (no re-encode)", async () => {
  const asset = { uri: "file:///a.jpg", width: 1200, height: 1440, mimeType: "image/jpeg", type: "image" };
  expect(await run(asset, resized)).toBe(asset);
  expect(resized).not.toHaveBeenCalled();
});

test("unknown dimensions, video, pdf and gif are never touched", async () => {
  for (const asset of [
    { uri: "file:///a.jpg", mimeType: "image/jpeg", type: "image" },
    { uri: "file:///v.mp4", width: 4000, height: 3000, mimeType: "video/mp4", type: "video" },
    { uri: "file:///d.pdf", width: 4000, height: 3000, mimeType: "application/pdf" },
    { uri: "file:///g.gif", width: 4000, height: 3000, mimeType: "image/gif", type: "image" },
  ]) {
    expect(await run(asset, resized)).toBe(asset);
  }
  expect(resized).not.toHaveBeenCalled();
});

test("PNG stays PNG (transparency)", async () => {
  const out = await run({ uri: "file:///a.png", width: 3000, height: 2000, mimeType: "image/png", type: "image", name: "logo.png" }, resized);
  expect(resized.mock.calls[0][2]).toEqual({ compress: UPLOAD_JPEG_QUALITY, format: "png" });
  expect(out.mimeType).toBe("image/png");
  expect(out.name).toBe("logo.png");
});

test("any failure falls back to the original asset - an upload is never lost to this step", async () => {
  const asset = { uri: "file:///a.jpg", width: 4000, height: 3000, mimeType: "image/jpeg", type: "image" };
  expect(await run(asset, jest.fn().mockRejectedValue(new Error("oom")))).toBe(asset);
  expect(await run(asset, jest.fn().mockResolvedValue({}))).toBe(asset);
});

test("a scanned document keeps a larger long edge + higher quality than a feed photo", async () => {
  const asset = { uri: "file:///scan.jpg", width: 4032, height: 3024, mimeType: "image/jpeg", type: "image" };
  await downscaleImageAsset(asset, { ...DOCUMENT_UPLOAD_OPTIONS, manipulate: resized, saveFormat: SaveFormat });

  expect(DOCUMENT_UPLOAD_OPTIONS.maxEdge).toBeGreaterThan(MAX_UPLOAD_EDGE);
  expect(DOCUMENT_UPLOAD_OPTIONS.quality).toBeGreaterThan(UPLOAD_JPEG_QUALITY);
  expect(resized).toHaveBeenCalledWith(
    "file:///scan.jpg",
    [{ resize: { width: DOCUMENT_UPLOAD_OPTIONS.maxEdge } }],
    { compress: DOCUMENT_UPLOAD_OPTIONS.quality, format: "jpeg" },
  );
});

test("a document image between the photo and document limits is left alone", async () => {
  const asset = { uri: "file:///scan.jpg", width: 2000, height: 1500, mimeType: "image/jpeg", type: "image" };
  const out = await downscaleImageAsset(asset, { ...DOCUMENT_UPLOAD_OPTIONS, manipulate: resized, saveFormat: SaveFormat });
  expect(out).toBe(asset);
  expect(resized).not.toHaveBeenCalled();
});
