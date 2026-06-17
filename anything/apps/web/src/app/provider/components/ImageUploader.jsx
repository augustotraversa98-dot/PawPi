import { useRef } from "react";
import { ImagePlus, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import useUpload from "@/utils/useUpload";
import { COLORS } from "../lib/colors";

// Shared multi-image uploader for provider SERVICES and PRODUCTS (ticket 2.23).
// Each picked file goes through the shared Storage upload path (useUpload → the
// platform /api/upload); the returned public URLs are kept as an ordered list.
// Supports add (multi), remove, and reorder. `value` is the array of URLs and
// `onChange(nextArray)` is called on every mutation. Real uploads only — when the
// list is empty nothing extra renders (the caller shows its own placeholder).
export const MAX_IMAGES = 8;

export default function ImageUploader({
  value,
  onChange,
  max = MAX_IMAGES,
  label = "Images",
}) {
  const [upload, { loading }] = useUpload();
  const inputRef = useRef(null);
  const urls = Array.isArray(value) ? value : [];
  const full = urls.length >= max;

  const onFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be re-picked later
    if (files.length === 0) return;
    const room = max - urls.length;
    if (room <= 0) {
      toast.error(`You can add up to ${max} images.`);
      return;
    }
    const next = [...urls];
    for (const file of files.slice(0, room)) {
      const res = await upload({ file });
      if (res?.error) {
        toast.error(res.error);
        continue;
      }
      if (res?.url) next.push(res.url);
    }
    if (next.length !== urls.length) onChange(next);
  };

  const remove = (i) => onChange(urls.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#3B241B]">
        {label}
        <span className="text-xs font-normal text-[#B8A99D]">
          {urls.length}/{max}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="relative h-20 w-20 overflow-hidden rounded-xl border-2"
            style={{ borderColor: COLORS.peach }}
          >
            <img
              src={url}
              alt={`${label} ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove image ${i + 1}`}
              className="absolute right-1 top-1 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move image ${i + 1} left`}
                className="p-0.5 text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === urls.length - 1}
                aria-label={`Move image ${i + 1} right`}
                className="p-0.5 text-white disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            aria-label="Add image"
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-semibold disabled:opacity-60"
            style={{ borderColor: COLORS.peach, color: COLORS.terracotta }}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            {loading ? "Uploading" : "Add"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFiles}
        className="hidden"
      />
    </div>
  );
}
