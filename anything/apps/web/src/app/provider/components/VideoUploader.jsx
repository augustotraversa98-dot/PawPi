import { useRef } from "react";
import { Video, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import useUpload from "@/utils/useUpload";
import { COLORS } from "../lib/colors";

// Single-video uploader (ticket 2.85). One short intro video per adoption listing → video_url.
// Reuses the shared Storage upload path (useUpload). `value` is the URL (or null/"") and
// `onChange(url|null)` fires on add/remove. Real uploads only — empty shows the add button.
export default function VideoUploader({ value, onChange, label = "Intro video" }) {
  const [upload, { loading }] = useUpload();
  const inputRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = await upload({ file });
    if (res?.error || !res?.url) {
      toast.error(res?.error || "Upload failed");
      return;
    }
    onChange(res.url);
  };

  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold text-[#3B241B]">{label}</div>
      {value ? (
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-xl border-2"
          style={{ borderColor: COLORS.peach }}
        >
          <video src={value} controls className="h-44 w-full bg-black object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove video"
            className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white hover:bg-black/75"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          aria-label="Add video"
          className="flex h-20 w-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-semibold disabled:opacity-60"
          style={{ borderColor: COLORS.peach, color: COLORS.terracotta }}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
          {loading ? "Uploading" : "Add video"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={onFile}
        className="hidden"
      />
    </div>
  );
}
