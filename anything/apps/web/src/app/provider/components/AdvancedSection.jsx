import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Collapsible "Advanced" section (Phase 3 form trimming). Essentials stay visible; the
// less-common fields live here, COLLAPSED BY DEFAULT. Children stay MOUNTED when collapsed
// — only the container's display is toggled — so their form values still submit and any
// controlled state (image uploaders, hours grids) survives a collapse/expand. `defaultOpen`
// lets a caller start expanded. Hardcoded English (the extranet has no i18n).
export default function AdvancedSection({
  label = "Advanced",
  children,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[#FFE7CE]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-[#7A6254] hover:bg-[#FFF7EF]"
      >
        <span>{label}</span>
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {/* Mounted even when collapsed (display:none) so values still submit. */}
      <div
        className="space-y-4 px-3 pb-3"
        style={{ display: open ? undefined : "none" }}
      >
        {children}
      </div>
    </div>
  );
}
