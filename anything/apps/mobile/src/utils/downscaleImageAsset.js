// Shrink a picked/captured photo before it is uploaded (perf audit 2026-10-23, F4.2).
//
// The composer and the other pickers hand the upload helper the camera's full-resolution file (a 12 MP phone
// photo is 3-5 MB), and POST /api/upload stores those bytes untouched: the median object in the public media
// bucket is 526 KB, the mean 1.7 MB, the largest 5.9 MB. Every viewer then downloads that file at feed-card size.
// Resizing to at most MAX_UPLOAD_EDGE px on the long edge (JPEG 0.75) is visually identical at a ~350 pt card and
// cuts the upload and every later download by roughly 85-95 %.
//
// Conservative on purpose: anything it is not sure about is returned UNCHANGED, and any failure falls back to the
// original asset, so an upload can never be lost to this step.
//   - only images (never video, PDFs, GIFs - re-encoding would drop the animation);
//   - only when the asset is known to be larger than the target (width/height come from the picker);
//   - PNG stays PNG (a logo/screenshot may rely on transparency); everything else becomes JPEG.

import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

export const MAX_UPLOAD_EDGE = 1440;
export const UPLOAD_JPEG_QUALITY = 0.75;

// Scanned paperwork (vet documents) needs the small print to stay legible, so it is kept at a larger long edge and
// a higher JPEG quality than a feed photo: 2200 px is ~A4 at 190 dpi, and a 12 MP phone scan still drops from
// ~12-15 MB to roughly 0.6-1 MB.
export const DOCUMENT_UPLOAD_OPTIONS = { maxEdge: 2200, quality: 0.8 };

// The system document picker returns an image's uri but not its pixel size, and downscaleImageAsset only resizes
// when it knows the asset is larger than the target. Resolve the size from the file; {} on any failure (the asset
// is then uploaded untouched, exactly as before).
export function resolveImageSize(uri) {
  return new Promise((resolve) => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve({}),
      );
    } catch {
      resolve({});
    }
  });
}

function withExtension(name, ext) {
  if (!name) return undefined; // the caller derives a name from the new uri
  return name.replace(/\.[A-Za-z0-9]+$/, "") + "." + ext;
}

/**
 * @param {{ uri?: string, width?: number, height?: number, mimeType?: string, type?: string, name?: string }} asset
 * @param {{ maxEdge?: number, quality?: number, manipulate?: Function, saveFormat?: { JPEG: string, PNG: string } }} [options]
 *   maxEdge / quality override the photo defaults (see DOCUMENT_UPLOAD_OPTIONS); manipulate / saveFormat are test seams
 * @returns {Promise<object>} the same asset, or a resized copy
 */
export async function downscaleImageAsset(asset, seams = {}) {
  const maxEdge = seams.maxEdge ?? MAX_UPLOAD_EDGE;
  const quality = seams.quality ?? UPLOAD_JPEG_QUALITY;
  try {
    const manipulate = seams.manipulate ?? ImageManipulator.manipulateAsync;
    const SaveFormat = seams.saveFormat ?? ImageManipulator.SaveFormat;
    const mime = String(asset?.mimeType ?? "").toLowerCase();
    const isImage = asset?.type === "image" || mime.startsWith("image/");
    if (!asset?.uri || !isImage || mime === "image/gif") return asset;

    const { width, height } = asset;
    if (!(width > 0 && height > 0) || Math.max(width, height) <= maxEdge) return asset;

    const isPng = mime === "image/png";
    const out = await manipulate(
      asset.uri,
      [{ resize: width >= height ? { width: maxEdge } : { height: maxEdge } }],
      { compress: quality, format: isPng ? SaveFormat.PNG : SaveFormat.JPEG },
    );
    if (!out?.uri) return asset;
    return {
      ...asset,
      uri: out.uri,
      width: out.width ?? asset.width,
      height: out.height ?? asset.height,
      mimeType: isPng ? "image/png" : "image/jpeg",
      name: withExtension(asset.name ?? asset.fileName, isPng ? "png" : "jpg"),
    };
  } catch {
    return asset;
  }
}
