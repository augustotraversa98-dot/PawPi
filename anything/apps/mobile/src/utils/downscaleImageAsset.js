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

import * as ImageManipulator from "expo-image-manipulator";

export const MAX_UPLOAD_EDGE = 1440;
export const UPLOAD_JPEG_QUALITY = 0.75;

function withExtension(name, ext) {
  if (!name) return undefined; // the caller derives a name from the new uri
  return name.replace(/\.[A-Za-z0-9]+$/, "") + "." + ext;
}

/**
 * @param {{ uri?: string, width?: number, height?: number, mimeType?: string, type?: string, name?: string }} asset
 * @param {{ manipulate?: Function, saveFormat?: { JPEG: string, PNG: string } }} [seams] test seams
 * @returns {Promise<object>} the same asset, or a resized copy
 */
export async function downscaleImageAsset(asset, seams = {}) {
  try {
    const manipulate = seams.manipulate ?? ImageManipulator.manipulateAsync;
    const SaveFormat = seams.saveFormat ?? ImageManipulator.SaveFormat;
    const mime = String(asset?.mimeType ?? "").toLowerCase();
    const isImage = asset?.type === "image" || mime.startsWith("image/");
    if (!asset?.uri || !isImage || mime === "image/gif") return asset;

    const { width, height } = asset;
    if (!(width > 0 && height > 0) || Math.max(width, height) <= MAX_UPLOAD_EDGE) return asset;

    const isPng = mime === "image/png";
    const out = await manipulate(
      asset.uri,
      [{ resize: width >= height ? { width: MAX_UPLOAD_EDGE } : { height: MAX_UPLOAD_EDGE } }],
      { compress: UPLOAD_JPEG_QUALITY, format: isPng ? SaveFormat.PNG : SaveFormat.JPEG },
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
