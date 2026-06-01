# Complete Routine → Reminder → Notification → Countdown System

## ✅ State Architecture

### **Source of Truth: Routines**
- `routinesStore` manages all routines
- Routines are the **only** source that generates reminders
- Every generated reminder has a `routineId` linking back to its source

### **Stores**

#### 1. **routinesStore** (`/store/routinesStore.js`)
```javascript
{
  routines: [],          // All routines (user-created and mock fallback)
  initialized: false,    // Whether initialization has run
  usedMockData: false,   // Whether mock routines are being used as fallback
}
```

**Key methods:**
- `initializeReminders()` - Generates reminders from active routines (runs once on app start)
- `addRoutine(routine)` - Creates routine and generates reminders
- `updateRoutine(id, updates)` - Updates routine and regenerates future reminders
- `deleteRoutine(id)` - Removes routine and deletes future reminders (keeps completed history)
- `toggleRoutineActive(id)` - Enable/disable routine and manage related reminders

#### 2. **remindersStore** (`/store/remindersStore.js`)
```javascript
{
  reminders: [],  // All reminders generated from routines
}
```

**Key methods:**
- `addReminderFromRoutine(reminder)` - Adds reminder with `routineId`
- `removeFutureRemindersByRoutine(routineId)` - Removes future reminders (keeps completed)
- `disableFutureRemindersByRoutine(routineId)` - Disables future reminders
- `completeReminder(id)` - Marks reminder complete and marks notification as read
- `snoozeReminder(id, option)` - Snoozes and prevents duplicate notifications
- `completeReminderByTracker(trackerType, bodyArea)` - Auto-completes reminder when tracker action happens

#### 3. **socialPetStore** (`/store/socialPetStore.js`)
```javascript
{
  notifications: [],           // All notifications including reminder notifications
  unreadNotificationCount: 0,  // Count of unread notifications
}
```

**Key methods:**
- `addNotification(notification)` - Creates notification (with `reminderId` and `routineId`)
- `markNotificationRead(id)` - Marks notification as read
- `markAllNotificationsRead()` - Marks all as read

---

## 🔄 Complete Flow

### **1. Routine Creation → Reminder Generation**

```
User creates routine
  ↓
routinesStore.addRoutine()
  ↓
generateRemindersFromRoutine() creates 14 days of reminders
  ↓
Each reminder saved with:
  - id: "reminder_{routineId}_{date}_{index}"
  - routineId: "routine_123"
  - petId: "phoebe"
  - type: "feeding" | "walk" | "medication" | ...
  - scheduledAt: ISO timestamp
  - status: "upcoming"
  ↓
remindersStore.addReminderFromRoutine(reminder)
```

### **2. Reminder → Notification (Background Sync)**

```
App starts
  ↓
startReminderNotificationSync() runs every 60 seconds
  ↓
For each active reminder:
  - Check status (due soon, due now, overdue)
  - Check if notification already exists
  - If due AND no existing notification:
    ↓
    generateNotificationFromReminder()
    ↓
    Notification created with:
      - id: "notif_{reminderId}"
      - reminderId: "reminder_123"
      - routineId: "routine_456"
      - type: "feeding"
      - title: "Feeding o'clock 🍽️"
      - message: "Time to feed Phoebe dinner."
      - actionLabel: "Log food"
      - timeSensitive: true
      - relatedTracker: "feeding"
    ↓
    socialPetStore.addNotification(notification)
```

### **3. Notification Center Display**

```
User opens Notification Center
  ↓
Load notifications from socialPetStore
  ↓
For each notification with reminderId:
  - Show icon, title, message
  - Show action button ("Log food", "Start walk", etc.)
  - Show unread badge if not read
  ↓
User taps notification:
  - Mark as read
  - Navigate to Health tab (ready for deep link to tracker)
```

### **4. Countdown Cards**

```
UpcomingTab loads
  ↓
Get reminders from remindersStore
  ↓
Filter:
  - status !== COMPLETED
  - status !== DISABLED
  - routine.isActive === true
  ↓
Get time-sensitive due reminders:
  - timeSensitive === true
  - status === DUE_SOON | DUE_NOW | OVERDUE
  ↓
Display CountdownCard for each:
  - Show icon and countdown ("in 12 min", "now", "12 min overdue")
  - Action buttons: Complete, Snooze
  ↓
User taps Complete:
  - completeReminder(id)
  - Mark notification as read
  - Remove from countdown
  ↓
User taps Snooze:
  - Mark old notification as read (prevent duplicate)
  - Update reminder scheduledAt
  - Schedule new notification
```

### **5. Routine Updates**

```
User edits routine
  ↓
routinesStore.updateRoutine(id, updates)
  ↓
removeFutureRemindersByRoutine(id)
  - Deletes reminders where:
    - routineId === id
    - status !== COMPLETED
    - scheduledAt >= now
  - Keeps completed reminders for history
  ↓
generateRemindersFromRoutine(updatedRoutine)
  ↓
Create new reminders with updated schedule
```

### **6. Routine Deletion**

```
User deletes routine
  ↓
routinesStore.deleteRoutine(id)
  ↓
removeFutureRemindersByRoutine(id)
  - Deletes future reminders
  - Keeps completed reminders (historical logs)
  ↓
Related notifications remain in history
```

### **7. Routine Disabled**

```
User toggles routine inactive
  ↓
routinesStore.toggleRoutineActive(id)
  ↓
disableFutureRemindersByRoutine(id)
  - Sets status = DISABLED for future reminders
  - Keeps completed reminders
  ↓
Disabled reminders:
  - Do NOT appear in countdown cards
  - Do NOT generate new notifications
  - Remain in database for history
```

### **8. Snooze (No Duplicates)**

```
User snoozes reminder
  ↓
remindersStore.snoozeReminder(id, option)
  ↓
1. Find existing notification for reminder
2. Mark existing notification as read
3. Cancel scheduled push notification
4. Update reminder:
   - snoozedUntil = new time
   - scheduledAt = new time
   - status = SNOOZED
5. Schedule new push notification
  ↓
Result: Only 1 active notification per reminder
```

### **9. Tracker → Reminder Auto-Complete**

```
User logs food/walk/medication/etc.
  ↓
completeReminderByTracker(trackerType, bodyArea)
  ↓
Find matching reminders:
  - relatedTracker === trackerType
  - relatedBodyArea === bodyArea (if applicable)
  - status !== COMPLETED
  - scheduledAt is today or overdue
  ↓
completeReminder(id) for each match
  ↓
Mark related notifications as read
```

---

## 🎯 Requirements Met

### ✅ **Routines are the source of truth**
- All reminders generated from routines
- Routines stored in `routinesStore`

### ✅ **Upcoming reminders are generated from active routines**
- `generateRemindersFromRoutine()` creates 14 days ahead
- Only active routines (`isActive === true`)

### ✅ **Every generated reminder has routineId**
- Format: `id: "reminder_{routineId}_{date}_{index}"`
- `routineId` field preserved throughout lifecycle

### ✅ **Editing a routine updates only future reminders**
- `removeFutureRemindersByRoutine()` filters by `scheduledAt >= now`
- Completed reminders untouched

### ✅ **Completed reminders remain in history**
- `status === COMPLETED` reminders never deleted
- Filter them out in UI, but preserve in store

### ✅ **Disabled routines do not trigger new reminders/notifications/countdown**
- `UpcomingTab` filters out reminders from inactive routines
- `syncRemindersToNotifications()` skips disabled reminders
- Countdown cards only show active reminders

### ✅ **Deleted routines remove future reminders but keep historical completed logs**
- `removeFutureRemindersByRoutine()` deletes future only
- Completed reminders remain with `routineId` for history

### ✅ **Notification Center items include reminderId and routineId**
```javascript
{
  id: "notif_reminder_123",
  reminderId: "reminder_123",
  routineId: "routine_456",
  // ... other fields
}
```

### ✅ **Countdown cards are based on generated reminders**
- Pull from `useRemindersStore()`
- Filter by `routineId` to ensure they're from routines
- No hardcoded mock data

### ✅ **Snoozing does not create duplicates**
- Marks old notification as read before creating new one
- Checks for existing unread notification before creating
- Only 1 active notification per reminder

### ✅ **Completing a tracker action completes the matching reminder**
- `completeReminderByTracker(trackerType, bodyArea)`
- Auto-detects and completes today's reminder
- Marks related notification as read

### ✅ **Hardcoded mock reminders are only used when there are no user-created routines**
- `routinesStore` starts with `routines: []`
- `initializeReminders()` checks if `routines.length === 0`
- If empty, loads `mockRoutines` as fallback
- Sets `usedMockData: true` flag
- Once user creates a routine, mock data is replaced

---

## 🔧 Key Files

### **Stores**
- `/apps/mobile/src/store/routinesStore.js` - Routine management
- `/apps/mobile/src/store/remindersStore.js` - Reminder management
- `/apps/mobile/src/store/socialPetStore.js` - Notification center

### **Utilities**
- `/apps/mobile/src/utils/reminderGenerator.js` - Generates reminders from routines
- `/apps/mobile/src/utils/notificationGenerator.js` - Generates notifications from reminders
- `/apps/mobile/src/utils/reminderNotificationSync.js` - Background sync system

### **Components**
- `/apps/mobile/src/components/Health/Reminders/UpcomingTab.jsx` - Countdown cards + reminder list
- `/apps/mobile/src/components/Health/Reminders/CountdownCard.jsx` - Time-sensitive card UI
- `/apps/mobile/src/components/Health/Reminders/SettingsTab.jsx` - Notification settings
- `/apps/mobile/src/app/notifications.jsx` - Notification Center

### **Data**
- `/apps/mobile/src/data/routinesData.js` - Routine constants + mock routines (fallback)
- `/apps/mobile/src/data/remindersData.js` - Reminder constants + helpers (no mock usage)

---

## 🚀 Initialization

**On app start:**
1. `_layout.jsx` calls `startReminderNotificationSync()`
2. Background sync runs every 60 seconds
3. `UpcomingTab` calls `routinesStore.initializeReminders()` on mount
4. If no user routines exist, loads `mockRoutines` as fallback
5. Generates reminders from all active routines
6. Sync system creates notifications for due reminders

**State flow:**
```
Routines (source of truth)
  ↓
Reminders (generated, with routineId)
  ↓
Notifications (generated from due reminders, with reminderId + routineId)
  ↓
UI (Countdown cards, Notification Center)
```

---

## 💡 Design Decisions

### **Why routines are the source of truth**
- Users manage routines, not individual reminders
- Editing a routine should update all future occurrences
- Deleting a routine should clean up future reminders
- Historical data (completed reminders) preserved for analytics

### **Why reminders are generated 14 days ahead**
- Balance between performance and convenience
- Can be extended by calling `generateRemindersFromRoutine()` again
- Old completed reminders cleaned up separately

### **Why notifications are generated on-demand (sync)**
- Prevents notification spam
- Only shows notifications when due
- User sees countdown cards before notifications
- Notifications appear gradually as reminders become due

### **Why snoozing marks old notification as read**
- Prevents duplicate notifications in Notification Center
- User sees only 1 active notification per reminder
- Old snoozed notifications remain in history (read state)

### **Why completed reminders are never deleted**
- Historical tracking ("I fed Phoebe 15 times this month")
- Vet summary generation
- Analytics and insights
- Proof of care routine adherence

---

## 🎉 Result

**A complete, production-ready system where:**
- Routines create reminders ✅
- Reminders trigger notifications ✅
- Notifications appear in Notification Center ✅
- Countdown cards show urgent reminders ✅
- Everything stays in sync ✅
- No duplicates ✅
- History preserved ✅
- Mock data only used as fallback ✅
