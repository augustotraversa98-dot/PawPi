// PawPi Home/Lock-screen Widget (ticket 2.76, Phase 1).
//
// Renders the active pet's day: today's next reminders + done count, the 2.37
// posting streak, the next vet appointment, and any in-progress walk/trip. Reads
// the JSON snapshot the RN app writes into the shared App Group container; falls
// back to a clean "Open PawPi" empty state when there's no snapshot, and to a
// hardcoded SAMPLE in Xcode previews (the sample is for previews ONLY — never a
// user-facing surface).
//
// 🟠 App Group is a PLACEHOLDER until the Apple account is ready — see
// PawPiWidgetConfig below and docs/native-widgets.md.

import WidgetKit
import SwiftUI

// MARK: - Account-gated config (keep in sync with src/native/appGroup.ts)

enum PawPiWidgetConfig {
    // TODO(Tats): real App Group ID — identical to APP_GROUP_ID in appGroup.ts.
    static let appGroupId = "group.PLACEHOLDER.pawpi"
    static let snapshotKey = "pawpi.widget.snapshot.v1"
    static let kind = "PawPiTodayWidget"

    static var isConfigured: Bool { !appGroupId.contains("PLACEHOLDER") }
}

// MARK: - Brand palette (warm PawPi)

extension Color {
    static let pawCoral = Color(red: 1.00, green: 0.435, blue: 0.380) // #FF6F61
    static let pawPeach = Color(red: 1.00, green: 0.898, blue: 0.851) // #FFE5D9
    static let pawBrown = Color(red: 0.231, green: 0.141, blue: 0.106) // #3B241B
    static let pawCream = Color(red: 1.00, green: 0.969, blue: 0.937) // #FFF7EF
    static let pawMuted = Color(red: 0.545, green: 0.451, blue: 0.333) // #8B7355
}

// MARK: - Snapshot model (mirrors buildWidgetSnapshot in JS)

struct WidgetReminder: Codable, Hashable {
    let title: String
    let time: String?
    let done: Bool
}

struct WidgetAppointment: Codable, Hashable {
    let title: String
    let clinic: String?
    let time: String?
}

struct WidgetActivity: Codable, Hashable {
    let kind: String       // "walk" | "trip"
    let label: String?
    let status: String?
    let eta: String?
}

struct PawPiSnapshot: Codable {
    let hasPet: Bool
    let petName: String?
    let petPhoto: String?
    let streakDays: Int
    let todayReminders: [WidgetReminder]
    let doneCount: Int
    let totalCount: Int
    let nextAppointment: WidgetAppointment?
    let activeActivity: WidgetActivity?
    let deepLink: String?

    // Preview-only sample. NEVER shown to a real user (previews / placeholder).
    static let sample = PawPiSnapshot(
        hasPet: true,
        petName: "Rex",
        petPhoto: nil,
        streakDays: 5,
        todayReminders: [
            WidgetReminder(title: "Breakfast", time: "2026-06-18T08:00:00Z", done: false),
            WidgetReminder(title: "Evening walk", time: "2026-06-18T18:00:00Z", done: false),
            WidgetReminder(title: "Apoquel", time: "2026-06-18T20:00:00Z", done: false),
        ],
        doneCount: 2,
        totalCount: 5,
        nextAppointment: WidgetAppointment(
            title: "Annual checkup", clinic: "Paws Clinic", time: "2026-06-20T09:00:00Z"
        ),
        activeActivity: nil,
        deepLink: "pawpi://widget/today"
    )

    static let sampleWalk = PawPiSnapshot(
        hasPet: true, petName: "Rex", petPhoto: nil, streakDays: 5,
        todayReminders: [], doneCount: 3, totalCount: 3, nextAppointment: nil,
        activeActivity: WidgetActivity(kind: "walk", label: "Sam", status: "in_progress", eta: nil),
        deepLink: "pawpi://widget/walk?sessionId=42"
    )

    // Logged-out / no-pet empty state.
    static let empty = PawPiSnapshot(
        hasPet: false, petName: nil, petPhoto: nil, streakDays: 0,
        todayReminders: [], doneCount: 0, totalCount: 0,
        nextAppointment: nil, activeActivity: nil, deepLink: "pawpi://widget/home"
    )
}

// Load the snapshot the app wrote into the shared App Group container.
func loadPawPiSnapshot() -> PawPiSnapshot {
    guard PawPiWidgetConfig.isConfigured,
          let defaults = UserDefaults(suiteName: PawPiWidgetConfig.appGroupId),
          let json = defaults.string(forKey: PawPiWidgetConfig.snapshotKey),
          let data = json.data(using: .utf8),
          let snap = try? JSONDecoder().decode(PawPiSnapshot.self, from: data)
    else { return .empty }
    return snap
}

// MARK: - Time helper

func shortTime(_ iso: String?) -> String {
    guard let iso = iso, !iso.isEmpty else { return "" }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    let date = withFraction.date(from: iso) ?? plain.date(from: iso)
    guard let d = date else { return "" }
    let out = DateFormatter()
    out.locale = Locale.current
    out.dateFormat = "h:mm a"
    return out.string(from: d)
}

// MARK: - Timeline

struct PawPiEntry: TimelineEntry {
    let date: Date
    let snapshot: PawPiSnapshot
}

struct PawPiProvider: TimelineProvider {
    func placeholder(in context: Context) -> PawPiEntry {
        PawPiEntry(date: Date(), snapshot: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (PawPiEntry) -> Void) {
        let snap = context.isPreview ? PawPiSnapshot.sample : loadPawPiSnapshot()
        completion(PawPiEntry(date: Date(), snapshot: snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PawPiEntry>) -> Void) {
        let entry = PawPiEntry(date: Date(), snapshot: loadPawPiSnapshot())
        // The app pushes reloads via WidgetCenter on relevant changes; this
        // periodic refresh is just a safety net so times stay current.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())
            ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Reusable bits

struct PawHeader: View {
    let name: String
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "pawprint.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.pawCoral)
            Text(name)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.pawBrown)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }
}

struct StreakBadge: View {
    let days: Int
    var body: some View {
        if days > 0 {
            HStack(spacing: 2) {
                Text("🔥").font(.system(size: 12))
                Text("\(days)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.pawBrown)
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.pawPeach))
        }
    }
}

struct ReminderRow: View {
    let reminder: WidgetReminder
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color.pawCoral)
                .frame(width: 5, height: 5)
            Text(reminder.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.pawBrown)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(shortTime(reminder.time))
                .font(.system(size: 12))
                .foregroundColor(.pawMuted)
        }
    }
}

struct EmptyState: View {
    var compact: Bool = false
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "pawprint.fill")
                .font(.system(size: compact ? 20 : 26))
                .foregroundColor(.pawCoral)
            Text("Open PawPi to get started")
                .font(.system(size: compact ? 12 : 13, weight: .medium))
                .foregroundColor(.pawMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// In-progress walk/trip banner (highest-priority surface).
struct ActivityBanner: View {
    let activity: WidgetActivity
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: activity.kind == "trip" ? "car.fill" : "figure.walk")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
            Text(activity.kind == "trip" ? "Trip in progress" : "Walk in progress")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.pawCoral))
    }
}

// MARK: - System families

struct SmallView: View {
    let snap: PawPiSnapshot
    var body: some View {
        if !snap.hasPet {
            EmptyState(compact: true)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    PawHeader(name: snap.petName ?? "PawPi")
                    StreakBadge(days: snap.streakDays)
                }
                if let activity = snap.activeActivity {
                    ActivityBanner(activity: activity)
                    Spacer(minLength: 0)
                } else if snap.todayReminders.isEmpty {
                    Spacer(minLength: 0)
                    Text(snap.doneCount > 0 ? "All done for today 🎉" : "Nothing due today")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.pawMuted)
                    Spacer(minLength: 0)
                } else {
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(snap.todayReminders.prefix(2), id: \.self) { r in
                            ReminderRow(reminder: r)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("\(snap.doneCount)/\(snap.totalCount) done")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.pawCoral)
                }
            }
            .padding(12)
        }
    }
}

struct MediumView: View {
    let snap: PawPiSnapshot
    var body: some View {
        if !snap.hasPet {
            EmptyState()
        } else {
            HStack(alignment: .top, spacing: 14) {
                // Left: pet + streak + progress.
                VStack(alignment: .leading, spacing: 8) {
                    PawHeader(name: snap.petName ?? "PawPi")
                    StreakBadge(days: snap.streakDays)
                    Spacer(minLength: 0)
                    Text("\(snap.doneCount)/\(snap.totalCount) done today")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.pawCoral)
                }
                .frame(width: 110, alignment: .leading)

                // Right: today's next reminders / activity / appointment.
                VStack(alignment: .leading, spacing: 6) {
                    if let activity = snap.activeActivity {
                        ActivityBanner(activity: activity)
                    }
                    if !snap.todayReminders.isEmpty {
                        ForEach(snap.todayReminders.prefix(3), id: \.self) { r in
                            ReminderRow(reminder: r)
                        }
                    } else if snap.activeActivity == nil {
                        Text(snap.doneCount > 0 ? "All done for today 🎉" : "Nothing due today")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.pawMuted)
                    }
                    if let apt = snap.nextAppointment {
                        Divider().background(Color.pawPeach)
                        HStack(spacing: 5) {
                            Image(systemName: "stethoscope")
                                .font(.system(size: 11))
                                .foregroundColor(.pawMuted)
                            Text("\(apt.title) · \(shortTime(apt.time))")
                                .font(.system(size: 11))
                                .foregroundColor(.pawMuted)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
        }
    }
}

// MARK: - Lock-screen accessory families (iOS 16+)

struct AccessoryRectView: View {
    let snap: PawPiSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "pawprint.fill")
                Text(snap.petName ?? "PawPi").font(.headline).lineLimit(1)
                if snap.streakDays > 0 { Text("🔥\(snap.streakDays)").font(.caption2) }
            }
            if let activity = snap.activeActivity {
                Text(activity.kind == "trip" ? "Trip in progress" : "Walk in progress")
                    .font(.caption2).lineLimit(1)
            } else if let first = snap.todayReminders.first {
                Text("\(shortTime(first.time)) · \(first.title)").font(.caption2).lineLimit(1)
            } else {
                Text("\(snap.doneCount)/\(snap.totalCount) done").font(.caption2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AccessoryInlineView: View {
    let snap: PawPiSnapshot
    var body: some View {
        if let activity = snap.activeActivity {
            Label(activity.kind == "trip" ? "Trip in progress" : "Walk in progress",
                  systemImage: "pawprint.fill")
        } else if let first = snap.todayReminders.first {
            Label("\(first.title) \(shortTime(first.time))", systemImage: "pawprint.fill")
        } else {
            Label("\(snap.doneCount)/\(snap.totalCount) done", systemImage: "pawprint.fill")
        }
    }
}

struct AccessoryCircularView: View {
    let snap: PawPiSnapshot
    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "pawprint.fill").font(.system(size: 14))
            if snap.streakDays > 0 {
                Text("\(snap.streakDays)").font(.system(size: 13, weight: .bold))
            } else {
                Text("\(snap.doneCount)/\(snap.totalCount)").font(.system(size: 11, weight: .semibold))
            }
        }
    }
}

// MARK: - Entry view + widget

struct PawPiWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: PawPiEntry

    var body: some View {
        content
            .widgetURL(URL(string: entry.snapshot.deepLink ?? "pawpi://widget/home"))
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemSmall:
            SmallView(snap: entry.snapshot).widgetCardBackground()
        case .systemMedium:
            MediumView(snap: entry.snapshot).widgetCardBackground()
        case .accessoryRectangular:
            AccessoryRectView(snap: entry.snapshot).widgetAccessoryBackground()
        case .accessoryInline:
            AccessoryInlineView(snap: entry.snapshot)
        case .accessoryCircular:
            AccessoryCircularView(snap: entry.snapshot).widgetAccessoryBackground()
        default:
            SmallView(snap: entry.snapshot).widgetCardBackground()
        }
    }
}

// Container background — cream for the Home-screen tiles, system default for
// the Lock-screen accessories (which render translucent).
extension View {
    @ViewBuilder
    func widgetCardBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(Color.pawCream, for: .widget)
        } else {
            self.background(Color.pawCream)
        }
    }

    @ViewBuilder
    func widgetAccessoryBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(.clear, for: .widget)
        } else {
            self
        }
    }
}

struct PawPiWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: PawPiWidgetConfig.kind, provider: PawPiProvider()) { entry in
            PawPiWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("PawPi")
        .description("Today's reminders, your streak, and what's next.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular,
        ])
    }
}

@main
struct PawPiWidgetBundle: WidgetBundle {
    var body: some Widget {
        PawPiWidget()
    }
}

// MARK: - Xcode previews (sample data only)

struct PawPiWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            PawPiWidgetEntryView(entry: PawPiEntry(date: Date(), snapshot: .sample))
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            PawPiWidgetEntryView(entry: PawPiEntry(date: Date(), snapshot: .sample))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
            PawPiWidgetEntryView(entry: PawPiEntry(date: Date(), snapshot: .sampleWalk))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
            PawPiWidgetEntryView(entry: PawPiEntry(date: Date(), snapshot: .empty))
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            PawPiWidgetEntryView(entry: PawPiEntry(date: Date(), snapshot: .sample))
                .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
        }
    }
}
