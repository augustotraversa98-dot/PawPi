import {
  buildWidgetSnapshot,
  resolveWidgetRoute,
  widgetDeepLink,
  WIDGET_TARGETS,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
} from "./widgetSnapshot";

const now = new Date("2026-06-18T12:00:00Z");
const pet = { id: 7, name: "Rex", avatar_url: "https://x/y.jpg" };

describe("buildWidgetSnapshot", () => {
  it("emits an empty/'open PawPi' snapshot when there is no pet", () => {
    const snap = buildWidgetSnapshot({ pet: null, now });
    expect(snap.hasPet).toBe(false);
    expect(snap.petName).toBeNull();
    expect(snap.todayReminders).toEqual([]);
    expect(snap.streakDays).toBe(0);
    expect(snap.deepLink).toBe("pawpi://widget/home");
    expect(snap.schemaVersion).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION);
  });

  it("treats a nameless pet as no pet (no fabricated data)", () => {
    expect(buildWidgetSnapshot({ pet: { id: 1, name: "" }, now }).hasPet).toBe(false);
  });

  it("maps pet + streak + today's reminders, sorted soonest-first and capped", () => {
    const snap = buildWidgetSnapshot({
      pet,
      streakDays: 5,
      completedCount: 2,
      reminders: [
        { id: "c", title: "Walk", scheduledAt: "2026-06-18T18:00:00Z" },
        { id: "a", title: "Breakfast", scheduledAt: "2026-06-18T13:00:00Z" },
        { id: "b", title: "Pill", scheduledAt: "2026-06-18T15:00:00Z" },
        { id: "d", title: "Dinner", scheduledAt: "2026-06-18T20:00:00Z" },
      ],
      now,
      maxReminders: 3,
    });
    expect(snap.hasPet).toBe(true);
    expect(snap.petName).toBe("Rex");
    expect(snap.petId).toBe("7");
    expect(snap.petPhoto).toBe("https://x/y.jpg");
    expect(snap.streakDays).toBe(5);
    expect(snap.todayReminders).toHaveLength(3); // capped
    expect(snap.todayReminders.map((r) => r.title)).toEqual(["Breakfast", "Pill", "Walk"]);
    expect(snap.doneCount).toBe(2);
    expect(snap.totalCount).toBe(5); // 2 done + 3 shown
    expect(snap.deepLink).toBe("pawpi://widget/today");
  });

  it("drops completed/disabled and timeless reminders", () => {
    const snap = buildWidgetSnapshot({
      pet,
      reminders: [
        { id: "a", title: "Done", scheduledAt: "2026-06-18T13:00:00Z", status: "completed" },
        { id: "b", title: "Off", scheduledAt: "2026-06-18T14:00:00Z", status: "disabled" },
        { id: "c", title: "No time" },
        { id: "d", title: "Real", scheduledAt: "2026-06-18T15:00:00Z" },
      ],
      now,
    });
    expect(snap.todayReminders.map((r) => r.title)).toEqual(["Real"]);
  });

  it("surfaces the next appointment and links to vet-record when nothing else wins", () => {
    const snap = buildWidgetSnapshot({
      pet,
      nextAppointment: {
        title: "Checkup",
        clinic: "Paws Clinic",
        appointmentDateTime: "2026-06-20T09:00:00Z",
      },
      now,
    });
    expect(snap.nextAppointment).toEqual({
      title: "Checkup",
      clinic: "Paws Clinic",
      time: "2026-06-20T09:00:00Z",
    });
    expect(snap.deepLink).toBe("pawpi://widget/appointment");
  });

  it("an in-progress walk outranks everything as the primary tap target", () => {
    const snap = buildWidgetSnapshot({
      pet,
      reminders: [{ id: "a", title: "Walk", scheduledAt: "2026-06-18T18:00:00Z" }],
      activeWalk: { id: 42, status: "in_progress", walker_name: "Sam" },
      now,
    });
    expect(snap.activeActivity).toMatchObject({ kind: "walk", sessionId: "42", label: "Sam" });
    expect(snap.deepLink).toBe("pawpi://widget/walk?sessionId=42");
  });

  it("an in-transit trip is described with its ETA", () => {
    const snap = buildWidgetSnapshot({
      pet,
      activeTrip: {
        id: 9,
        status: "in_transit",
        dropoff_address: "Vet, 5th Ave",
        estimated_arrival: "2026-06-18T12:30:00Z",
      },
      now,
    });
    expect(snap.activeActivity).toMatchObject({
      kind: "trip",
      tripId: "9",
      eta: "2026-06-18T12:30:00Z",
    });
    expect(snap.deepLink).toBe("pawpi://widget/trip?tripId=9");
  });

  it("ignores walks/trips that are not in progress", () => {
    const snap = buildWidgetSnapshot({
      pet,
      activeWalk: { id: 1, status: "finished" },
      activeTrip: { id: 2, status: "scheduled" },
      now,
    });
    expect(snap.activeActivity).toBeNull();
    expect(snap.deepLink).toBe("pawpi://widget/home");
  });
});

describe("widgetDeepLink", () => {
  it("builds clean URLs and drops empty params", () => {
    expect(widgetDeepLink(WIDGET_TARGETS.TODAY)).toBe("pawpi://widget/today");
    expect(widgetDeepLink(WIDGET_TARGETS.WALK, { sessionId: "5" })).toBe(
      "pawpi://widget/walk?sessionId=5",
    );
    expect(widgetDeepLink(WIDGET_TARGETS.WALK, { sessionId: null })).toBe("pawpi://widget/walk");
    expect(widgetDeepLink()).toBe("pawpi://widget/home");
  });
});

describe("resolveWidgetRoute", () => {
  it("routes each widget target to the right expo-router screen", () => {
    expect(resolveWidgetRoute("pawpi://widget/today")).toEqual({
      pathname: "/(tabs)/health",
      params: { section: "today" },
    });
    expect(resolveWidgetRoute("pawpi://widget/appointment")).toEqual({
      pathname: "/(tabs)/health",
      params: { section: "vet-record" },
    });
    expect(resolveWidgetRoute("pawpi://widget/walk?sessionId=42")).toEqual({
      pathname: "/walk-live",
      params: { sessionId: "42" },
    });
    expect(resolveWidgetRoute("pawpi://widget/trip?tripId=9")).toEqual({
      pathname: "/service/transport",
      params: {},
    });
    expect(resolveWidgetRoute("pawpi://widget/home")).toEqual({ pathname: "/(tabs)", params: {} });
  });

  it("falls back to the feed for a walk link with no session", () => {
    expect(resolveWidgetRoute("pawpi://widget/walk")).toEqual({ pathname: "/(tabs)", params: {} });
  });

  it("falls back to the feed for unknown, foreign, or malformed URLs", () => {
    expect(resolveWidgetRoute("pawpi://widget/bogus")).toEqual({ pathname: "/(tabs)", params: {} });
    expect(resolveWidgetRoute("https://evil.example/widget/today")).toEqual({
      pathname: "/(tabs)",
      params: {},
    });
    expect(resolveWidgetRoute("")).toEqual({ pathname: "/(tabs)", params: {} });
    expect(resolveWidgetRoute(null)).toEqual({ pathname: "/(tabs)", params: {} });
  });
});
