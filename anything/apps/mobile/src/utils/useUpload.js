import * as React from "react";
import { Platform } from "react-native";

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
            "[useUpload] Asset has no file property, uploading bytes to /api/upload",
          );

          // Upload the file bytes to our backend, which stores them in Supabase
          // Storage (service_role key stays server-side) and returns the public URL.
          const fileName = asset.name ?? asset.uri.split("/").pop() ?? "upload";
          const formData = new FormData();
          if (Platform.OS === "web") {
            // Browser FormData can't consume RN's { uri, name, type } shape — it
            // stringifies it to "[object Object]" and the server rejects it with
            // 400 "file is required". Fetch the uri (data: / blob: / http:) into a
            // real Blob so the backend receives an actual file.
            const blob = await fetch(asset.uri).then((r) => r.blob());
            formData.append("file", blob, fileName);
          } else {
            // React Native's FormData streams the file straight from its uri.
            formData.append("file", {
              uri: asset.uri,
              name: fileName,
              type: asset.mimeType ?? "image/jpeg",
            });
          }

          response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
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
