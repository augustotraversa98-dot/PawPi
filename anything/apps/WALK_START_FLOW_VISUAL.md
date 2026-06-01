# Walk Start Flow - Visual Guide

## 🎯 Complete User Journey

---

## **STEP 1: Entry Point - Health Today**

```
┌─────────────────────────────────────┐
│  Health Today                       │
│  Saturday, May 9, 2026              │
├─────────────────────────────────────┤
│                                     │
│  ⚠️ Due Soon            [2]         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  ⚡ TIME-SENSITIVE             │ │
│  │                                │ │
│  │         🚶                     │ │
│  │       5 min                    │ │
│  │    Evening walk                │ │
│  │  Phoebe · 30 min · normal      │ │
│  │                                │ │
│  │  [  🎬 Start walk  ]           │ │
│  │  [  ✏️  Log manually  ]        │ │
│  │  [  ⏰ Snooze  ]               │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**User taps:** "Start walk" →

---

## **STEP 2: Live Walk Tracking**

```
┌─────────────────────────────────────┐
│  🚶 Evening walk            [✕]     │
│  Phoebe                             │
├─────────────────────────────────────┤
│                                     │
│        ┌─────────────────┐          │
│        │                 │          │
│        │                 │          │
│        │      24:32      │          │
│        │    remaining    │          │
│        │                 │          │
│        └─────────────────┘          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Scheduled duration    30 min  │ │
│  │ Elapsed time           6 min  │ │
│  │ Pace                  normal  │ │
│  └───────────────────────────────┘ │
│                                     │
│  [  ⏸  Pause  ]                    │
│                                     │
│  Notes (optional)                   │
│  ┌───────────────────────────────┐ │
│  │ Park route with friends       │ │
│  └───────────────────────────────┘ │
│                                     │
│  [  ⏹  Finish Walk  ]              │
└─────────────────────────────────────┘
```

**User can:**
- **Pause** → Timer stops, shows "Resume" button
- **Finish Walk** (early) → Goes to post-walk feedback
- Let countdown reach zero → Shows extend options

---

## **STEP 3A: Countdown Finished - Extend Options**

```
┌─────────────────────────────────────┐
│  🚶 Evening walk            [✕]     │
│  Phoebe                             │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │           ⏰                   │ │
│  │    Walk time is up            │ │
│  │  Did Phoebe finish the walk?  │ │
│  └───────────────────────────────┘ │
│                                     │
│  Extend walk?                       │
│                                     │
│  [ ➕ Extend 10 min ]               │
│  [ ➕ Extend 15 min ]               │
│  [ ➕ Extend 30 min ]               │
│                                     │
│  Notes (optional)                   │
│  ┌───────────────────────────────┐ │
│  │ Park route with friends       │ │
│  └───────────────────────────────┘ │
│                                     │
│  [  ⏹  Finish Walk  ]              │
└─────────────────────────────────────┘
```

**User can:**
- **Extend 10/15/30 min** → Adds time, countdown resumes
- **Finish Walk** → Goes to post-walk feedback

---

## **STEP 3B: Finish Early**

```
User taps "Finish Walk" at 18 minutes
↓
Actual duration saved: 18 minutes
(Not the scheduled 30 minutes)
```

---

## **STEP 4: Post-Walk Feedback - Choice**

```
┌─────────────────────────────────────┐
│  How was the walk?          [✕]     │
│  Evening walk · 18 min              │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │           ✅                  │ │
│  │                               │ │
│  │      Normal walk              │ │
│  │                               │ │
│  │  Everything went as expected  │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │         ⚠️                    │ │
│  │  Something was different      │ │
│  │   Log additional details      │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**User taps "Normal walk"** → Saves immediately →

---

## **STEP 5A: Normal Walk - Saved**

```
┌─────────────────────────────────────┐
│                                     │
│        ┌───────────────┐            │
│        │      ✓       │            │
│        └───────────────┘            │
│                                     │
│         Walk logged!                │
│                                     │
│      Great job, Phoebe!             │
│                                     │
└─────────────────────────────────────┘

Saved to database:
✓ start_time: 2025-05-09 18:30:00
✓ duration_minutes: 18
✓ pace: normal
✓ energy_after: normal
✓ potty_events: { pee: 0, poo: 0 }
✓ notes: "Park route with friends"

Timeline event created:
✓ "Walk completed"
✓ "Evening walk · 18 min"

Reminder marked complete:
✓ Countdown card removed
✓ Health Today updates
```

---

## **STEP 5B: Something Was Different - Detailed Form**

```
┌─────────────────────────────────────┐
│  How was the walk?          [✕]     │
│  Evening walk · 18 min              │
├─────────────────────────────────────┤
│  Energy after walk                  │
│  [ Low ] [Normal] [ High ]          │
│                                     │
│  Pace                               │
│  [Relaxed] [Normal] [Active]        │
│                                     │
│  Potty events                       │
│  💩 Poo  [ 0 ][ 1 ][ 2 ][ 3 ]       │
│  💦 Pee  [ 0 ][ 1 ][ 2 ][ 3 ]       │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ☐ Limping or stiffness        │ │
│  │ ☐ Unusual behavior            │ │
│  └───────────────────────────────┘ │
│                                     │
│  Additional notes                   │
│  ┌───────────────────────────────┐ │
│  │ Seemed tired, slower pace     │ │
│  └───────────────────────────────┘ │
│                                     │
│  [ ⚠️ Info: This may be worth     │
│    monitoring if it continues ]    │
│                                     │
│  [     Save Walk     ]              │
│  [ ← Back ]                         │
└─────────────────────────────────────┘
```

---

## **STEP 6: Health Today - Updated**

```
┌─────────────────────────────────────┐
│  Health Today                       │
│  Saturday, May 9, 2026              │
├─────────────────────────────────────┤
│  ⚠️ Due Soon            [1]         │
│  (Evening walk removed)             │
│                                     │
│  📅 Next Up                         │
│  ┌───────────────────────────────┐ │
│  │ 🍽️ Dinner                     │ │
│  │ in 2 hours                    │ │
│  │ [ Log food ]                  │ │
│  └───────────────────────────────┘ │
│                                     │
│  📈 Today's Progress                │
│  🍽️ Fed 2 times                    │
│  🚶 1 walk  ← UPDATED               │
│  💊 Medication given                │
└─────────────────────────────────────┘
```

---

## **STEP 7: Walk History - Persisted**

```
┌─────────────────────────────────────┐
│  Walk & Activity                    │
├─────────────────────────────────────┤
│  Walks today      1                 │
│  Duration        18 min             │
│  Distance        0.0 mi             │
│                                     │
│  Last walk                          │
│  ┌───────────────────────────────┐ │
│  │  🚶  Evening walk             │ │
│  │  Today · 6:30 PM              │ │
│  │  18 min · 0.0 mi · normal     │ │
│  │  😊 normal energy after       │ │
│  │                               │ │
│  │  "Park route with friends"    │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## **🔄 Snooze Flow**

```
User taps "Snooze" on countdown card
↓
┌─────────────────────────────────────┐
│  Snooze Evening walk        [✕]     │
├─────────────────────────────────────┤
│  When would you like to be          │
│  reminded?                          │
│                                     │
│  [ ⏰ In 10 minutes ]               │
│  [ ⏰ In 30 minutes ]               │
│  [ ⏰ In 1 hour ]                   │
│  [ 🌙 Tonight (8 PM) ]             │
│  [ ☀️ Tomorrow (9 AM) ]            │
└─────────────────────────────────────┘

User selects option
↓
Reminder snoozed:
✓ snoozedUntil updated
✓ status = "snoozed"
✓ Countdown card removed
✓ Alert: "⏰ Evening walk snoozed for 30 minutes"

After snooze expires:
✓ Reminder becomes due again
✓ Countdown card reappears
✓ Same walk, same settings
```

---

## **🎯 Key Features Demonstrated**

### **✅ Entry Points:**
- Health Today countdown cards
- Walk reminders
- Walk tracker quick choice

### **✅ Live Tracking:**
- Countdown timer
- Pause/Resume
- Finish early
- Notes field

### **✅ Extend:**
- Shows when countdown ends
- 10/15/30 minute options
- Continues same walk session

### **✅ Post-Walk Feedback:**
- Normal walk (quick save)
- Detailed form (energy, pace, potty, mobility)
- Safe messaging for concerns

### **✅ Database:**
- Actual start time
- Actual duration (not scheduled)
- Timeline event
- Walk history persists

### **✅ Reminder Completion:**
- Countdown card removed
- Health Today updates
- Today's Progress updates

### **✅ Snooze:**
- Flexible options
- Preserves walk data
- Reappears after snooze

---

## **📊 Data Flow**

```
Walk Routine
    ↓
Reminder Generated
  (with relatedWalk data)
    ↓
Countdown Card Shown
  (Health Today)
    ↓
User Taps "Start Walk"
    ↓
StartWalkModal Opens
  (live countdown)
    ↓
User Finishes Walk
  (early or after countdown)
    ↓
PostWalkFeedbackModal Opens
    ↓
User Selects Option
  (normal or detailed)
    ↓
Walk Log Created
  (health_walk_logs)
    ↓
Timeline Event Created
  (health_timeline_events)
    ↓
Reminder Marked Complete
    ↓
Health Today Updates
    ↓
Walk History Updated
    ↓
Done! ✅
```

---

## **🎉 Production-Ready Features**

✅ Multiple entry points (Today, Reminders, Track)
✅ Live countdown with pause/resume
✅ Finish early (saves actual time)
✅ Extend when time's up (10/15/30 min)
✅ Post-walk feedback (normal vs. detailed)
✅ Database logging with actual start_time and duration
✅ Timeline events auto-created
✅ Reminder completion
✅ Health Today real-time updates
✅ Snooze functionality
✅ No duplicate logs
✅ Walk history persistence
✅ Per-walk schedules (daily, weekdays, custom days)
✅ Safe messaging for health concerns

**The Start Walk flow is complete and ready to use!** 🚀
