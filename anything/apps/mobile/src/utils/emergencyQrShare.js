// Export the Emergency Card tag QR as a PNG image and hand it to the system share sheet.
//
// The PNG comes from react-native-svg's `toDataURL` (the QR component's own <Svg>), is written to the cache
// folder, and is shared:
//   - iOS: React Native's Share, which can send the image AND the link text together (Mail, WhatsApp, Copy…).
//   - Android: expo-sharing (Android's Share cannot attach a file); the link travels in the dialog title and the
//     screen has a separate "Copy link" button.

import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const EXPORT_TIMEOUT_MS = 8000;

/** A safe file name for the exported QR, e.g. "pawpi-qr-nino.png". */
export function qrFileName(petName) {
  const slug = String(petName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `pawpi-qr-${slug}.png` : "pawpi-qr.png";
}

/** Everything the share needs, from plain data. `message` always carries the link text. */
export function buildQrSharePayload({ petName, url, t }) {
  const name = petName || t("emergencyCard.myPet");
  return {
    fileName: qrFileName(petName),
    title: t("emergencyCard.qrShareTitle", { name }),
    message: `${t("emergencyCard.qrShareMessage", { name })}\n${url}`,
  };
}

/**
 * Promise form of the SVG's callback-style toDataURL. Resolves to bare base64 (no line breaks).
 *
 * No size option on purpose: on iOS react-native-svg only enlarges the CANVAS for a requested width/height and
 * keeps drawing at the on-screen size (a tiny QR in the corner of a blank image). Without it the export is the
 * on-screen QR at the device's pixel density (about 530 px on a 3x iPhone).
 */
export function qrToBase64(svg) {
  return new Promise((resolve, reject) => {
    if (!svg?.toDataURL) {
      reject(new Error("QR code is not ready"));
      return;
    }
    const timer = setTimeout(() => reject(new Error("QR export timed out")), EXPORT_TIMEOUT_MS);
    svg.toDataURL((data) => {
      clearTimeout(timer);
      const base64 = String(data || "").replace(/\s+/g, "");
      if (base64) resolve(base64);
      else reject(new Error("QR export was empty"));
    });
  });
}

function writeCacheFile(fileName, base64) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  return file.uri;
}

/** Write the QR PNG to the cache and open the share sheet. Throws if it cannot be exported or shared. */
export async function shareQrImage({ svg, petName, url, t }) {
  const payload = buildQrSharePayload({ petName, url, t });
  const uri = writeCacheFile(payload.fileName, await qrToBase64(svg));
  if (Platform.OS === "ios") {
    await Share.share({ url: uri, message: payload.message }, { subject: payload.title });
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available");
  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: `${payload.title} · ${url}`,
  });
}
