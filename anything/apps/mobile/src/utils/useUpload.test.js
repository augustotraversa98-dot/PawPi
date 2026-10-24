// useUpload wiring for the photo downscale (perf audit 2026-10-23, F4.2): a big camera photo is resized BEFORE it is
// appended to the multipart body; non-images and small images are sent as picked.
import { renderHook, act } from "@testing-library/react-native";

const mockManipulate = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args) => mockManipulate(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

import useUpload from "./useUpload";

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
