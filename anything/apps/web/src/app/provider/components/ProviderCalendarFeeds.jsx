import { useState } from "react";
import {
  CalendarClock,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderCalendarFeeds,
  useAddCalendarFeed,
  useSyncCalendarFeed,
  useRemoveCalendarFeed,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Calendar import (ticket 2.84). The provider pastes a private iCal/ICS feed URL (Google "secret
// address in iCal format", Outlook published ICS, Apple shared ICS); PawPi fetches it, parses
// VEVENTs into READ-ONLY busy blocks the booking availability subtracts. Add / Refresh now / Remove
// + last-synced time. Loaded inside the shell, so providerId is resolved.
export default function ProviderCalendarFeeds({ providerId }) {
  const { data: feeds, isLoading, isError, error } =
    useProviderCalendarFeeds(providerId);
  const add = useAddCalendarFeed(providerId);
  const syncOne = useSyncCalendarFeed(providerId);
  const remove = useRemoveCalendarFeed(providerId);

  const [url, setUrl] = useState("");

  const onAdd = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter an http(s) iCal feed URL");
      return;
    }
    add.mutate(trimmed, {
      onSuccess: (feed) => {
        toast.success("Feed added — syncing…");
        setUrl("");
        // Pull busy blocks immediately so the provider sees the result.
        if (feed?.id != null) syncOne.mutate(feed.id);
      },
      onError: (err) => toast.error(err?.message || "Couldn't add feed"),
    });
  };

  const onRefresh = (feed) =>
    syncOne.mutate(feed.id, {
      onSuccess: (res) =>
        res?.ok === false
          ? toast.error("Couldn't reach that calendar feed")
          : toast.success(`Synced ${res?.synced ?? 0} busy block(s)`),
      onError: (err) => toast.error(err?.message || "Couldn't sync feed"),
    });

  const onRemove = (feed) => {
    if (
      window.confirm(
        "Remove this calendar feed? Its imported busy blocks will be cleared and those times become bookable again.",
      )
    ) {
      remove.mutate(feed.id, {
        onSuccess: () => toast.success("Feed removed"),
        onError: (err) => toast.error(err?.message || "Couldn't remove feed"),
      });
    }
  };

  const list = feeds ?? [];

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <CalendarClock className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Calendar import</h1>
          <p className="text-sm text-[#7A6254]">
            Block your PawPi availability from your existing calendar so you’re never
            double-booked
          </p>
        </div>
      </div>

      <form
        onSubmit={onAdd}
        className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5"
      >
        <label className="mb-1 block text-sm font-semibold text-[#3B241B]">
          Private iCal / ICS feed URL
        </label>
        <p className="mb-3 text-xs text-[#7A6254]">
          Google Calendar → Settings → “Secret address in iCal format”. Outlook →
          “Publish calendar” (ICS). Apple → a shared/public ICS link. We only read
          busy times — no event details are stored.
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3">
            <LinkIcon className="h-4 w-4 text-[#B8A99D]" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://calendar.google.com/…/basic.ics"
              aria-label="iCal feed URL"
              className="w-full bg-transparent py-2.5 text-sm text-[#3B241B] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={add.isPending}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: COLORS.coral }}
          >
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add feed
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading feeds…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="font-semibold text-[#B23B30]">Couldn’t load feeds</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {error?.message || "Please try again."}
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-[#3B241B]">No feeds yet</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            Add an iCal feed above to block those times from being booked.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((feed) => {
            const busy = syncOne.isPending && syncOne.variables === feed.id;
            return (
              <div
                key={feed.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FFD9B3] bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#3B241B]">
                    {feed.ics_url}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7A6254]">
                    {feed.last_synced_at
                      ? `Last synced ${new Date(feed.last_synced_at).toLocaleString()}`
                      : "Not synced yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRefresh(feed)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#FFD9B3] bg-[#FFF7EF] px-2.5 py-1.5 text-xs font-semibold text-[#7A6254] disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
                    />
                    Refresh now
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(feed)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: "#FBE6E4",
                      color: "#B23B30",
                      borderColor: "#F3C9C4",
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
