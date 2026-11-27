import { useQuery } from "@tanstack/react-query";
import { activeRecordLinks, isGrantActive } from "@/utils/vetShare";
import { showChange } from "@/utils/sharingRefresh";
import { accessEntryKey, isEntryLive } from "@/utils/whoHasAccess";

// "Who has access" (docs/vet-sharing-design.md): everything that can open one of the owner's dogs' data right now.
// The ONE source for the count on My Hub and the list on Data Access: both read this hook, so they cannot disagree.
export const WHO_HAS_ACCESS_KEY = ["care-who-has-access"];

async function readList(url, field) {
  const response = await fetch(url);
  // A server from before this kind of sharing has none of it.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Failed to load who has access");
  const data = await response.json();
  return data[field] ?? [];
}

// A server without the single list: vet access and record links, from their own lists. Family and emergency card links
// are then left to their own screens (`partial`).
async function fromOlderRoutes() {
  const [grants, links] = await Promise.all([
    readList("/api/care-access/grants", "grants"),
    readList("/api/care-access/links", "links"),
  ]);
  return {
    partial: true,
    entries: [
      ...grants.filter((g) => isGrantActive(g)).map((g) => ({ ...g, kind: "vet" })),
      ...activeRecordLinks(links).map((l) => ({ ...l, kind: "record_link" })),
    ],
  };
}

async function readWhoHasAccess() {
  const response = await fetch(`/api/care-access/who-has-access`);
  if (response.status === 404) return fromOlderRoutes();
  if (!response.ok) throw new Error("Failed to load who has access");
  const data = await response.json();
  return { partial: false, entries: data.entries ?? [] };
}

// → { data: { entries, partial } }. A failed read is an error, never an empty list: "nobody has access" is only said
// when the server said so.
export function useWhoHasAccess() {
  return useQuery({
    queryKey: WHO_HAS_ACCESS_KEY,
    queryFn: readWhoHasAccess,
    // Access ends by date and is changed from several screens: never show a cached state as current.
    refetchOnMount: "always",
    select: (data) => ({ ...data, entries: data.entries.filter((e) => isEntryLive(e)) }),
  });
}

// A link the server has just confirmed, shown in the same moment.
export const showAccessGiven = (queryClient, entry) =>
  showChange(queryClient, WHO_HAS_ACCESS_KEY, (data) => ({
    ...data,
    entries: [entry, ...data.entries.filter((e) => accessEntryKey(e) !== accessEntryKey(entry))],
  }));

// A vet grant as the server just answered it: listed in the same moment, or taken off when it gives no access. A vet
// has one open grant per dog, so an active one replaces the vet's other entry for that dog. The answer repeats no
// names: they come from the entry already listed, `names`, or another entry of the same dog.
export const showVetAccess = (queryClient, grant, names = {}) =>
  showChange(queryClient, WHO_HAS_ACCESS_KEY, (data) => {
    const active = isGrantActive(grant);
    const isSame = (e) =>
      e.kind === "vet" &&
      (String(e.id) === String(grant.id) ||
        (active &&
          String(e.pet_id) === String(grant.pet_id) &&
          String(e.provider_id) === String(grant.provider_id)));
    const rest = data.entries.filter((e) => !isSame(e));
    if (!active) return { ...data, entries: rest };
    const previous = data.entries.find(isSame);
    const petName =
      grant.pet_name ??
      names.pet_name ??
      data.entries.find((e) => String(e.pet_id) === String(grant.pet_id))?.pet_name;
    const entry = {
      ...names,
      ...(previous?.id === grant.id ? previous : {}),
      ...grant,
      pet_name: petName,
      provider_name: grant.provider_name ?? names.provider_name ?? previous?.provider_name,
      kind: "vet",
    };
    return { ...data, entries: [entry, ...rest] };
  });

// An access the server has confirmed as ended leaves every list in the same moment.
export const showAccessEnded = (queryClient, kind, id) =>
  showChange(queryClient, WHO_HAS_ACCESS_KEY, (data) => ({
    ...data,
    entries: data.entries.filter((e) => !(e.kind === kind && String(e.id) === String(id))),
  }));

export const refreshWhoHasAccess = (queryClient) =>
  queryClient.invalidateQueries({ queryKey: WHO_HAS_ACCESS_KEY });
