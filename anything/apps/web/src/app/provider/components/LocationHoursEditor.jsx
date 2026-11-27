import { X } from "lucide-react";
import { WEEKDAYS, blankRange, weekdayName } from "../lib/hours";
import locationsCopy from "../i18n/locations";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";

const fieldCls =
  "rounded-lg border-2 border-[#FFD9B3] bg-[#FFF7EF] px-2 py-1.5 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]";

// The opening hours of one location, a row per weekday: open (one range, or several for a day that closes at
// midday), closed, or open all day. `rows` and `onChange` are the shape lib/hours.js converts.
export default function LocationHoursEditor({ rows, onChange }) {
  const { t, lang } = useProviderCopy(locationsCopy);

  // Editing a day replaces whatever was stored for it.
  const setDay = (dayKey, changes) =>
    onChange((prev) => ({ ...prev, [dayKey]: { ...prev[dayKey], ...changes, stored: undefined } }));

  return (
    <div className="space-y-2">
      {WEEKDAYS.map(({ key }) => {
        const day = weekdayName(key, lang);
        const row = rows[key];
        const setRange = (index, field, value) =>
          setDay(key, {
            ranges: row.ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
          });
        const label = (first, nth, position) =>
          position === 1 ? fill(first, { day }) : fill(nth, { day, position });
        return (
          <div key={key} className="flex items-start gap-2">
            <span className="w-9 py-1.5 text-sm font-semibold text-[#7A6254]">{day}</span>
            <select
              aria-label={fill(t.form.daySchedule, { day })}
              value={row.status}
              onChange={(e) => setDay(key, { status: e.target.value })}
              className={fieldCls}
            >
              <option value="hours">{t.form.statusOpen}</option>
              <option value="closed">{t.form.statusClosed}</option>
              <option value="allDay">{t.form.statusAllDay}</option>
            </select>
            {row.status === "hours" && (
              <div className="min-w-0 flex-1 space-y-1.5">
                {row.ranges.map((range, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      aria-label={label(t.form.dayOpen, t.form.dayOpenNth, index + 1)}
                      value={range.open}
                      onChange={(e) => setRange(index, "open", e.target.value)}
                      className={`min-w-0 flex-1 ${fieldCls}`}
                    />
                    <span className="text-[#B8A99D]">–</span>
                    <input
                      type="time"
                      aria-label={label(t.form.dayClose, t.form.dayCloseNth, index + 1)}
                      value={range.close}
                      onChange={(e) => setRange(index, "close", e.target.value)}
                      className={`min-w-0 flex-1 ${fieldCls}`}
                    />
                    {row.ranges.length > 1 && (
                      <button
                        type="button"
                        aria-label={fill(t.form.removeRangeAria, { day, position: index + 1 })}
                        onClick={() => setDay(key, { ranges: row.ranges.filter((_, i) => i !== index) })}
                        className="rounded-lg p-1 text-[#7A6254] hover:bg-[#FFF7EF]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {row.ranges.every((r) => r.open && r.close) && (
                  <button
                    type="button"
                    aria-label={fill(t.form.addRangeAria, { day })}
                    onClick={() => setDay(key, { ranges: [...row.ranges, blankRange()] })}
                    className="text-xs font-semibold text-[#7A6254] underline"
                  >
                    {t.form.addRange}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
