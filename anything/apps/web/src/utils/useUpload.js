import * as React from 'react';

// /api/upload (apps/web/src/app/api/upload/route.js) only accepts multipart
// form-data with a `file` field and returns { url, mimeType } — it does not
// accept the JSON { url } / { base64 } / { buffer } bodies the old
// /_create/api/upload/ platform endpoint did. Wrap every input shape as a
// real file part so all four branches hit the same real endpoint (mirrors the
// mobile fix in apps/mobile/src/utils/useUpload.js, commit 55cff0e).
function useUpload() {
  const [loading, setLoading] = React.useState(false);
  const upload = React.useCallback(async (input) => {
    try {
      setLoading(true);
      let response;
      if ("file" in input && input.file) {
        const formData = new FormData();
        formData.append("file", input.file);
        response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
      } else if ("url" in input) {
        const blob = await fetch(input.url).then((r) => r.blob());
        const fileName = input.url.split("/").pop()?.split("?")[0] || "upload";
        const formData = new FormData();
        formData.append("file", blob, fileName);
        response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
      } else if ("base64" in input) {
        const dataUri = input.base64.startsWith("data:")
          ? input.base64
          : `data:application/octet-stream;base64,${input.base64}`;
        const blob = await fetch(dataUri).then((r) => r.blob());
        const formData = new FormData();
        formData.append("file", blob, "upload");
        response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
      } else {
        const formData = new FormData();
        formData.append("file", new Blob([input.buffer]), "upload");
        response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
      }
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("Upload failed: File too large.");
        }
        throw new Error("Upload failed");
      }
      const data = await response.json();
      return { url: data.url, mimeType: data.mimeType || null };
    } catch (uploadError) {
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