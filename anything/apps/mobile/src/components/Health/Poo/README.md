# Poo Tracker

Complete digestive health tracking system for pet health monitoring.

## Components

### PooTrackerModal
Full-screen modal for logging poo entries with quick and detailed options.

**Features:**
- **Quick Log**: "Same as usual" (instant save) or "Something changed" (detailed form)
- **Detailed Form**: Amount, shape/consistency, color, blood, mucus, effort/straining, accident, photo, notes
- **Photo Upload**: Take photo or choose from library
- **Safety Warnings**: Displays health advisory if concerning symptoms are logged
- **Confirmation Screen**: Shows success message after logging

**Fields:**
- **Amount**: Small, Medium, Large
- **Shape/Consistency**: Hard, Normal, Soft, Liquid
- **Color**: Brown, Yellow, Green, Black, Red, Other
- **Blood**: Yes/No
- **Mucus**: Yes/No
- **Effort/Straining**: None, Mild, Strong
- **Accident in house**: Yes/No
- **Photo**: Optional upload
- **Notes**: Free text

**Safety Triggers:**
Displays warning message if any of these are detected:
- Blood present
- Black stool
- Liquid stool
- Strong straining

**Warning Message:**
"This may be worth discussing with a veterinarian, especially if it continues, worsens, or comes with vomiting, pain, or low energy."

### PooDashboard
Summary card showing today's poo tracking stats and recent changes.

**Displays:**
- **Last Logged**: Most recent poo entry with time, consistency, and color
- **Today's Count**: Number of poo logs today
- **Most Recent Consistency**: Shape label with emoji
- **Photo Indicator**: Camera icon if photo was uploaded
- **Concern Warnings**: Alert card if concerning patterns detected

**Concern Detection:**
Monitors last 3 poo logs for:
- Blood
- Black stool
- Liquid stool
- Strong straining

## Data Layer

### pooData.js
Mock data and helper functions for poo tracking.

**Helper Functions:**
- `getTodayPooLogs()` - Returns all poo logs from today
- `getLastPooLog()` - Returns most recent poo log
- `getPooCountToday()` - Returns count of today's logs
- `getRecentConsistency()` - Returns most recent shape/consistency
- `hasRecentConcerns()` - Checks last 3 logs for concerning symptoms
- `getConcernMessage()` - Generates warning message based on concerns
- `addPooLog(logData)` - Adds new poo log to state
- `getPooLogsWithPhotos()` - Returns logs that have photos
- `getShapeLabel(shape)` - Returns shape with emoji (e.g., "✅ Normal")
- `getColorIndicator(color)` - Returns color emoji (e.g., "🟤")
- `logHasConcerns(log)` - Checks if single log has concerning symptoms

**Data Structure:**
```javascript
{
  id: "poo001",
  petId: "phoebe",
  timestamp: "2026-05-06T08:30:00Z",
  amount: "medium",
  shape: "soft",
  color: "brown",
  blood: false,
  mucus: false,
  effort: "none",
  accident: false,
  photoUrl: null,
  notes: "Softer than usual",
  isDefault: false
}
```

## Integration

### Today Tab (HealthToday.jsx)
- **PooDashboard** displays in "Digestive health" section
- **Today's Timeline** includes poo logs with emoji 💩, shape, and notes
- Logs sorted by time (most recent first)

### Track Tab (HealthTrack.jsx)
- "Poo & Digestion" tracker opens PooTrackerModal
- Brown color (#8D6E63) for consistency with digestive theme
- Positioned after Water Intake in tracker list

## User Flow

### Quick Log
1. Tap "Poo & Digestion" in Track tab
2. Modal opens: "How was Phoebe's poo?"
3. Tap "Same as usual"
4. System saves default poo log (medium, normal, brown, no concerns)
5. Shows checkmark confirmation
6. Closes automatically after 1.5 seconds

### Detailed Log
1. Tap "Poo & Digestion" in Track tab
2. Modal opens: "How was Phoebe's poo?"
3. Tap "Something changed"
4. Fill in detailed form (amount, shape, color, etc.)
5. Optionally add photo
6. Tap "Log Poo Entry"
7. If concerning symptoms detected:
   - Shows warning screen with health advisory
   - Tap "Got it, thanks" to acknowledge
8. Shows confirmation screen
9. Closes automatically

### Photo Upload
- **Take Photo**: Opens camera to capture new photo
- **Choose Photo**: Opens photo library to select existing photo
- **Remove Photo**: Tap X button on uploaded photo preview
- Photo permissions handled automatically

## Safety Guidelines

**Non-Diagnostic Language:**
- ✅ "May be worth discussing"
- ✅ "Worth monitoring"
- ✅ "Consider contacting your vet"
- ❌ Never says "diagnosis", "disease", or "treatment"

**Concerning Symptoms:**
- Blood in stool
- Black stool (may indicate digested blood)
- Liquid/diarrhea (repeated)
- Strong straining (may indicate obstruction or pain)

**Warning Trigger Logic:**
- Checks last 3 poo logs
- Displays alert card in dashboard if any concerning symptoms found
- Shows in-modal warning after logging concerning entry
- Does not block logging or scare user

## Production Considerations

**Current Implementation:**
- Uses mock data in `pooData.js`
- Changes persist in session but reset on app restart

**For Production:**
1. Replace mock data with database/API calls
2. Store photos in cloud storage (e.g., uploadcare, S3)
3. Add state management (Zustand, React Query)
4. Sync logs with backend
5. Add photo history gallery
6. Export data for vet visits (PDF, CSV)
7. Add notifications for unusual patterns
8. Track trends over weeks/months

## Design System

**Colors:**
- Primary: Brown (#8D6E63) - digestive/natural theme
- Success: Sage green (#A7BFA3)
- Warning: Orange (#FFB74D)
- Alert: Coral (#FF6F61)

**Emoji Indicators:**
- Shape: 💎 Hard, ✅ Normal, 🌊 Soft, 💧 Liquid
- Color: 🟤 Brown, 🟡 Yellow, 🟢 Green, ⚫ Black, 🔴 Red, ⚪ Other
- Timeline: 💩 Poo logged

**Typography:**
- Section titles: 18px, weight 800
- Labels: 14px, weight 600
- Body text: 13-14px, weight 400-500
- Buttons: 16px, weight 800
