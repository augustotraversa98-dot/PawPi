import * as React from "react";
import { UploadClient } from "@uploadcare/upload-client";
const client = new UploadClient({
  publicKey: process.env.EXPO_PUBLIC_UPLOADCARE_PUBLIC_KEY,
});

function useUpload() {
  const [loading, setLoading] = React.useState(false);
  const upload = React.useCallback(async (input) => {
    try {
      console.log("[useUpload] ========================================");
      console.log("[useUpload] Starting upload");
      console.log("[useUpload] Input:", input);
      setLoading(true);
      let response;

      if ("reactNativeAsset" in input && input.reactNativeAsset) {
        let asset = input.reactNativeAsset;
        console.log("[useUpload] React Native asset detected");
        console.log("[useUpload] Asset URI:", asset.uri);
        console.log("[useUpload] Asset name:", asset.name);
        console.log("[useUpload] Asset mimeType:", asset.mimeType);

        if (asset.file) {
          console.log(
            "[useUpload] Asset has file property, using FormData upload",
          );
          const formData = new FormData();
          formData.append("file", asset.file);

          response = await fetch("/_create/api/upload/", {
            method: "POST",
            body: formData,
          });
        } else {
          console.log(
            "[useUpload] Asset has no file property, using Uploadcare presigned upload",
          );
          console.log("[useUpload] Requesting presigned URL...");

          // Fallback to presigned Uploadcare upload
          const presignRes = await fetch("/_create/api/upload/presign/", {
            method: "POST",
          });

          if (!presignRes.ok) {
            const errorText = await presignRes.text();
            console.error("[useUpload] ERROR: Presign request failed");
            console.error("[useUpload] Status:", presignRes.status);
            console.error("[useUpload] Response:", errorText);
            throw new Error(
              `Failed to get presigned URL: ${presignRes.status} ${errorText}`,
            );
          }

          const { secureSignature, secureExpire } = await presignRes.json();
          console.log("[useUpload] ✅ Presigned URL obtained");
          console.log("[useUpload] Secure signature:", secureSignature);
          console.log("[useUpload] Secure expire:", secureExpire);

          console.log("[useUpload] Uploading to Uploadcare...");
          const result = await client.uploadFile(asset, {
            fileName: asset.name ?? asset.uri.split("/").pop(),
            contentType: asset.mimeType,
            secureSignature,
            secureExpire,
          });

          console.log("[useUpload] ✅ Uploadcare upload result:", result);
          console.log("[useUpload] File UUID:", result.uuid);
          console.log("[useUpload] MIME type:", result.mimeType);

          // Construct URL - use standard Uploadcare CDN
          const baseUrl =
            process.env.EXPO_PUBLIC_BASE_CREATE_USER_CONTENT_URL ||
            "https://ucarecdn.com";
          const uploadedUrl = `${baseUrl}/${result.uuid}/`;
          console.log("[useUpload] Base URL:", baseUrl);
          console.log("[useUpload] Final URL:", uploadedUrl);
          console.log("[useUpload] ========================================");

          return {
            url: uploadedUrl,
            mimeType: result.mimeType || null,
          };
        }
      } else if ("url" in input) {
        console.log("[useUpload] URL input detected:", input.url);
        response = await fetch("/_create/api/upload/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: input.url }),
        });
      } else if ("base64" in input) {
        console.log("[useUpload] Base64 input detected");
        response = await fetch("/_create/api/upload/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ base64: input.base64 }),
        });
      } else {
        console.log("[useUpload] Buffer input detected");
        response = await fetch("/_create/api/upload/", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: input.buffer,
        });
      }

      if (response) {
        console.log("[useUpload] Fetch response status:", response.status);
        if (!response.ok) {
          if (response.status === 413) {
            console.error("[useUpload] ERROR: File too large (413)");
            throw new Error("Upload failed: File too large.");
          }
          const errorText = await response.text();
          console.error("[useUpload] ERROR: Upload failed");
          console.error("[useUpload] Status:", response.status);
          console.error("[useUpload] Response:", errorText);
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log("[useUpload] ✅ Upload response data:", data);
        console.log("[useUpload] URL:", data.url);
        console.log("[useUpload] ========================================");
        return { url: data.url, mimeType: data.mimeType || null };
      }
    } catch (uploadError) {
      console.error("[useUpload] ========================================");
      console.error("[useUpload] FATAL ERROR:");
      console.error("[useUpload] Error:", uploadError);
      console.error("[useUpload] Error message:", uploadError.message);
      console.error("[useUpload] Error stack:", uploadError.stack);
      console.error("[useUpload] ========================================");

      if (uploadError instanceof Error) {
        return { error: uploadError.message };
      }
      if (typeof uploadError === "string") {
        return { error: uploadError };
      }
      return { error: "Upload failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  return [upload, { loading }];
}

export { useUpload };
export default useUpload;
