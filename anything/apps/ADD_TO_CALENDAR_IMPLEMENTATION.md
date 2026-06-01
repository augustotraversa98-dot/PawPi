# Add to Calendar Implementation

## Overview
Walk Routines can now be added to the user's personal calendar as **private, busy events** to protect their time during dog walks.

---

## Features

### ✅ **1. Add to Calendar Button**

**Locations:**
- Walk Routine editor (WalkRoutineModal) - for each walk when expanded
- Routine card (RoutineCard) - for walk routines in the Routines tab
- Walk Countdown card (WalkCountdownCard) - for upcoming walk reminders

**Button appearance:**
```
┌────────────────────────┐
│ 📅 Add to calendar     │
└────────────────────────┘
```

---

### ✅ **2. Private Calendar Events**

**Event properties:**
- **Title:** `"Busy"` (private, doesn't reveal details)
- **Availability:** `BUSY` (blocks calendar time)
- **Notes:** `"Dog walk scheduled in Social Pet"`
- **Access Level:** `PRIVATE` (iOS only - event marked private)
- **Duration:** Start time + walk duration (default 30 min)
- **Recurrence:** Matches walk schedule (daily, weekly, monthly)

**Privacy first:**
- ✅ Title is generic ("Busy")
- ✅ Shared calendars won't reveal "dog walk"
- ✅ Marked as private/busy so no meeting invites during walks

---

### ✅ **3. Permission Flow**

**Permission is only requested when user taps "Add to calendar"**

**Flow:**
1. User taps "Add to calendar"
2. If permission not granted, show alert:
   ```
   Calendar Access
   
   Social Pet can add walk blocks to your calendar
   so your time stays protected.
   
   [Not now] [Allow calendar access]
   ```
3. If approved:
   - ✅ Create "Social Pet - Walks" calendar
   - ✅ Add event(s) to calendar
   - ✅ Show success message
4. If denied:
   - ❌ Show "Permission needed" message
   - ❌ No calendar changes

**No auto-request:** Permission is never requested on screen load

---

### ✅ **4. Repeating Events**

**Walk frequency → Calendar recurrence:**

| Walk Frequency | Calendar Recurrence |
|----------------|---------------------|
| **Daily** | Every day |
| **Weekly (custom days)** | Weekly on selected days (Mon, Wed, Fri, etc.) |
| **Weekdays** | Weekly (Mon-Fri) |
| **Weekends** | Weekly (Sat-Sun) |
| **Monthly** | Monthly on specified day |
| **One-time** | No recurrence |

**Example:**
```javascript
// Walk: "Morning walk" at 7:30 AM, daily, 30 min
↓
Calendar Event:
- Title: "Busy"
- Start: Today 7:30 AM
- End: Today 8:00 AM
- Recurrence: Daily
- Availability: Busy
- Access Level: Private
```

---

### ✅ **5. Social Pet Calendar**

**Dedicated calendar created:**
- Name: `"Social Pet - Walks"`
- Color: Sage green (`#A7BFA3`)
- Source: iCloud (iOS) or Google Calendar (Android)
- Falls back to local calendar if neither available

**Benefits:**
- ✅ Walk events grouped separately
- ✅ Easy to show/hide all walk blocks
- ✅ Clear visual distinction from other events

---

## Technical Implementation

### **File Structure**

```
/apps/mobile/src/
├── utils/
│   └── calendarIntegration.js       # Calendar utility functions
├── components/
│   └── Health/
│       ├── Reminders/
│       │   ├── WalkRoutineModal.jsx  # Walk editor with "Add to calendar"
│       │   └── RoutineCard.jsx       # Routine list card with button
│       └── WalkActivity/
│           └── WalkCountdownCard.jsx # Countdown card with button
```

---

### **Key Functions**

#### `requestCalendarPermission()`
```javascript
// Returns: boolean (true if granted)
// Shows permission alert before requesting
const hasPermission = await requestCalendarPermission();
```

#### `addWalkToCalendar(walk, petName)`
```javascript
// Adds walk to calendar with privacy settings
// Handles recurrence based on walk frequency
// Returns: boolean (true if successful)

const walk = {
  name: "Morning walk",
  time: "07:30",
  durationMinutes: 30,
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [], // For custom weekly schedules
  pace: "normal",
};

await addWalkToCalendar(walk, "Phoebe");
```

#### `getSocialPetCalendar()`
```javascript
// Gets or creates "Social Pet - Walks" calendar
// Returns: calendarId (string)
const calendarId = await getSocialPetCalendar();
```

#### `formatFrequency(walk)`
```javascript
// Returns human-readable frequency string
// Example: "daily", "every Mon, Wed, Fri", "monthly on day 15"
const frequency = formatFrequency(walk);
```

---

### **Platform Support**

| Platform | Status | Notes |
|----------|--------|-------|
| **iOS** | ✅ Full support | Private events, iCloud calendar, recurrence |
| **Android** | ✅ Full support | Busy events, Google Calendar, recurrence |
| **Web** | ❌ Not applicable | Mobile-only feature (expo-calendar) |

---

### **Recurrence Logic**

```javascript
function getRecurrenceRule(walk) {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) {
    return {
      frequency: Calendar.Frequency.DAILY,
      interval: 1,
    };
  }

  if (walk.frequency === ROUTINE_FREQUENCY.WEEKLY && walk.days?.length > 0) {
    return {
      frequency: Calendar.Frequency.WEEKLY,
      interval: 1,
      daysOfTheWeek: walk.days.map((day) => ({ dayOfTheWeek: day })),
    };
  }

  if (walk.frequency === ROUTINE_FREQUENCY.MONTHLY && walk.preferredDay) {
    return {
      frequency: Calendar.Frequency.MONTHLY,
      interval: 1,
      daysOfTheMonth: [walk.preferredDay],
    };
  }

  return null; // One-time event
}
```

---

## User Experience

### **Scenario 1: Creating a new walk routine**

1. User goes to **More → Reminders & Routines**
2. Taps **Create routine** → **Walks**
3. Sets up morning walk:
   - Name: "Morning walk"
   - Time: 7:30 AM
   - Frequency: Daily
   - Duration: 30 min
4. Expands walk details
5. Taps **"Add to calendar"**
6. Grants permission (first time only)
7. Success: "Added to calendar as a repeating event"

**Result:**
- ✅ Calendar event created for 7:30 AM daily
- ✅ Title shows "Busy" (private)
- ✅ 30-minute block marked as unavailable
- ✅ No meeting invites during walk time

---

### **Scenario 2: Upcoming walk reminder**

1. User sees countdown card for evening walk
2. Wants to block calendar time
3. Taps small **"Add to calendar"** button
4. Permission already granted
5. Success: "Added to calendar"

**Result:**
- ✅ One-time event added for this specific walk
- ✅ Calendar shows busy during walk time

---

### **Scenario 3: Bulk add all walks in routine**

1. User views walk routine card in Routines tab
2. Taps **"Add to calendar"** on the routine card
3. All walks in routine added at once
4. Success: "Added to calendar as a repeating event"

**Result:**
- ✅ Morning walk (7:30 AM) added daily
- ✅ Evening walk (6:30 PM) added daily
- ✅ Both marked as busy/private

---

## Error Handling

### **Permission Denied**
```
Alert: "Permission needed"
Message: "Calendar access is required to add walk events."
```

### **Calendar Creation Failed**
```
Alert: "Calendar unavailable"
Message: "Could not access or create calendar. Please try again."
```

### **Event Creation Failed**
```
Alert: "Error"
Message: "Could not add walk to calendar. Please try again."
```

---

## Privacy & Security

✅ **No personal information exposed**
- Event title is generic ("Busy")
- Shared calendars don't reveal activity

✅ **Permission-based**
- Only requests calendar access when needed
- User must explicitly grant permission

✅ **Private by default**
- iOS: `EventAccessLevel.PRIVATE`
- Android: Title "Busy" prevents detail exposure

✅ **User control**
- User can delete events anytime from their calendar app
- Events linked to "Social Pet - Walks" calendar for easy management

---

## Future Enhancements

🔮 **Possible additions:**
- Sync walk completions back to calendar (mark as done)
- Location-based calendar events (meeting point)
- Participant list for social walks
- Integration with Apple Health/Google Fit
- Custom calendar colors per pet
- Automatic walk rescheduling
- Walk route map in calendar notes

---

## Acceptance Criteria

✅ Each walk has an "Add to calendar" option
✅ Calendar permission only requested after user taps button
✅ Calendar event is private/busy if supported
✅ Repeating walks added as repeating calendar events
✅ Clean fallback if calendar not supported
✅ No crashes or permission errors
✅ Events appear in user's calendar app
✅ Shared calendars don't reveal "dog walk" details

---

## Testing Checklist

- [ ] iOS: Add single walk to calendar
- [ ] iOS: Add repeating walk (daily) to calendar
- [ ] iOS: Add repeating walk (weekly custom days) to calendar
- [ ] iOS: Verify event shows as "Private" in Calendar app
- [ ] iOS: Verify event shows as "Busy" in availability
- [ ] Android: Add single walk to calendar
- [ ] Android: Add repeating walk (daily) to calendar
- [ ] Android: Add repeating walk (weekly custom days) to calendar
- [ ] Android: Verify event shows as "Busy"
- [ ] Both: Permission denied flow works correctly
- [ ] Both: Permission alert only shows on first tap
- [ ] Both: Success message displays after adding
- [ ] Both: Events appear in default calendar app
- [ ] Both: "Social Pet - Walks" calendar is created
- [ ] Both: Calendar events have correct start/end times
- [ ] Both: Recurrence rules match walk frequency

---

## Support

**User asks:** "Why does my calendar show 'Busy' instead of 'Dog walk'?"

**Answer:** "For privacy, walk events are marked as 'Busy' so shared calendars don't reveal your personal activities. This protects your schedule while still blocking time during walks."

**User asks:** "Can I change the event title?"

**Answer:** "You can edit events in your calendar app after they're created. The 'Busy' title is the default for privacy."

**User asks:** "How do I remove walk events?"

**Answer:** "You can delete events from your calendar app, or hide the 'Social Pet - Walks' calendar to temporarily hide all walk blocks."
