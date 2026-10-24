// useUpload wiring for the photo downscale (perf audit 2026-10-23, F4.2): a big camera photo is resized BEFORE it is
// appended to the multipart body; non-images and small images are sent as picked.
import { renderHook, act } from "@testing-library/react-native";

const mockManipulate = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args) => mockManipulate(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

import useUpload, { UPLOAD_TIMEOUT_MS } from "./useUpload";

let sentParts;
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  mockManipulate.mockReset();
  sentParts = [];
  global.FormData = class {
    append(key, value) {
      sentParts.push([key, value]);
    }
  };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ url: "https://cdn/x.jpg", mimeType: "image/jpeg" }) }));
});

async function upload(asset) {
  const { result } = renderHook(() => useUpload());
  let res;
  await act(async () => {
    res = await result.current[0]({ reactNativeAsset: asset });
  });
  return res;
}

test("a full-resolution camera photo is shrunk before it is uploaded", async () => {
  mockManipulate.mockResolvedValue({ uri: "file:///tmp/small.jpg", width: 1080, height: 1440 });
  const res = await upload({ uri: "file:///cam/big.jpg", name: "big.jpg", width: 3024, height: 4032, mimeType: "image/jpeg", type: "image" });

  expect(res.url).toBe("https://cdn/x.jpg");
  expect(mockManipulate).toHaveBeenCalledTimes(1);
  expect(sentParts[0][1]).toMatchObject({ uri: "file:///tmp/small.jpg", type: "image/jpeg" });
});

test("a PDF or an already-small image goes up exactly as picked", async () => {
  await upload({ uri: "file:///d.pdf", name: "d.pdf", mimeType: "application/pdf" });
  await upload({ uri: "file:///s.jpg", name: "s.jpg", width: 800, height: 600, mimeType: "image/jpeg", type: "image" });

  expect(mockManipulate).not.toHaveBeenCalled();
  expect(sentParts[0][1]).toMatchObject({ uri: "file:///d.pdf", type: "application/pdf" });
  expect(sentParts[1][1]).toMatchObject({ uri: "file:///s.jpg" });
});

test("if resizing fails the original photo is still uploaded", async () => {
  mockManipulate.mockRejectedValue(new Error("out of memory"));
  const res = await upload({ uri: "file:///cam/big.jpg", name: "big.jpg", width: 3024, height: 4032, mimeType: "image/jpeg", type: "image" });

  expect(res.url).toBe("https://cdn/x.jpg");
  expect(sentParts[0][1]).toMatchObject({ uri: "file:///cam/big.jpg" });
});

test("the document downscale option is applied (2200 px long edge) for a big paperwork photo", async () => {
  mockManipulate.mockResolvedValue({ uri: "file:///tmp/doc.jpg", width: 2200, height: 1650 });
  const { result } = renderHook(() => useUpload());
  await act(async () => {
    await result.current[0]({
      reactNativeAsset: { uri: "file:///cam/doc.jpg", name: "doc.jpg", width: 4032, height: 3024, mimeType: "image/jpeg" },
      downscale: { maxEdge: 2200, quality: 0.8 },
      visibility: "private",
      petId: 3,
    });
  });
  expect(mockManipulate).toHaveBeenCalledWith(
    "file:///cam/doc.jpg",
    [{ resize: { width: 2200 } }],
    { compress: 0.8, format: "jpeg" },
  );
});

describe("upload deadline", () => {
  afterEach(() => jest.useRealTimers());

  test("an upload is NOT aborted at the 15 s first-party deadline, but is at its own longer one", async () => {
    jest.useFakeTimers();
    let signal;
    global.fetch = jest.fn((_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("Aborted")));
      });
    });
    const { result } = renderHook(() => useUpload());
    let res;
    const pending = act(async () => {
      res = await result.current[0]({
        reactNativeAsset: { uri: "file:///big.pdf", name: "big.pdf", mimeType: "application/pdf" },
      });
    });

    await jest.advanceTimersByTimeAsync(20_000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false); // would have been true under the 15 s default

    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(res).toEqual({ error: "Aborted" });
  });

  test("the deadline timer is cleared once the upload answers", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useUpload());
    const before = jest.getTimerCount();
    await act(async () => {
      await result.current[0]({
        reactNativeAsset: { uri: "file:///s.pdf", name: "s.pdf", mimeType: "application/pdf" },
      });
    });
    // Whatever else the test renderer schedules, no 120 s deadline timer may outlive the request.
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
  });
});
