# Pee Tracker

A comprehensive pee tracking system for monitoring urination patterns in pets.

## Components

### PeeTrackerModal
Main modal for logging pee entries with two-step flow:
1. Quick choice: "Same as usual" or "Something changed"
2. Detailed form (if needed)

**Features:**
- Quick logging for normal entries
- Detailed form with all health indicators
- Safety warnings for concerning symptoms
- Confirmation feedback

**Fields:**
- Volume: Small, Normal, Large
- Color: Pale, Yellow, Dark, Red/Pink, Other
- Accident in house: Yes/No
- Difficulty peeing: Yes/No
- Pain or crying: Yes/No
- Blood visible: Yes/No
- Increased thirst: Yes/No
- Notes (optional)

### PeeDashboard
Summary card showing:
- Last logged entry with time, volume, color
- Today's count
- Accident count
- Concern warnings (if applicable)

### Data Structure (peeData.js)

**Pee Log:**
```javascript
{
  id: "pee001",
  petId: "phoebe",
  timestamp: "2026-05-06T09:15:00Z",
  volume: "normal",
  color: "yellow",
  accident: false,
  difficulty: false,
  pain: false,
  blood: false,
  increasedThirst: false,
  notes: "",
  isDefault: true
}
```

## Safety Guidelines

**Concerning Symptoms:**
- Blood visible
- Difficulty peeing
- Pain or crying
- Repeated accidents (2+ in last 3 logs)

**Warning Levels:**
- **Standard**: Blood, repeated accidents
- **Urgent**: Difficulty peeing, pain/crying

**Safety Message:**
"This may be worth discussing with a veterinarian. Seek professional care if your dog seems unable to pee, is painful, or symptoms continue."

## Helper Functions

**Data Retrieval:**
- `getTodayPeeLogs()` - All logs from today
- `getLastPeeLog()` - Most recent log
- `getPeeCountToday()` - Count of entries today
- `getTodayAccidents()` - Count of accidents today
- `getRecentVolume()` - Last logged volume
- `getRecentColor()` - Last logged color

**Analysis:**
- `hasRecentConcerns()` - Checks last 3 logs for concerns
- `getConcernMessage()` - Generates concern message with urgency level
- `logHasConcerns()` - Checks single log for concerns
- `hasRepeatedAccidents()` - Checks for pattern of accidents

**Formatting:**
- `getVolumeLabel()` - Returns emoji + label (💧 Small, ✅ Normal, 💦 Large)
- `getColorIndicator()` - Returns color emoji (⚪ Pale, 🟡 Yellow, etc.)
- `getColorLabel()` - Returns capitalized color name

## Usage

```javascript
import PeeDashboard from "@/components/Health/Pee/PeeDashboard";

// In your component
<PeeDashboard />
```

## Timeline Integration

Pee logs appear in Today's Timeline with:
- 💧 emoji
- Time stamp
- Volume and color labels
- Notes (if any)
- Accident badge (if applicable)

## Production Considerations

1. **Database Integration**: Replace mock data with real database
2. **User Authentication**: Associate logs with specific users/pets
3. **Notifications**: Alert on concerning patterns
4. **Trend Analysis**: Weekly/monthly pattern visualization
5. **Vet Export**: Generate shareable reports for veterinary visits
6. **Multi-Pet Support**: Track multiple pets separately
7. **Reminders**: Scheduled prompts to log after walks

## Color Coding

- **Blue (#64B5F6)**: Primary pee tracker theme
- **Orange (#FFB74D)**: Standard concern warnings
- **Red (#FF5733)**: Urgent concern warnings (difficulty, pain)
- **Green (sage)**: Normal/healthy indicators

## Accessibility

- Clear visual hierarchy
- Color-coded indicators with emoji fallbacks
- Descriptive labels
- Touch-friendly button sizes
- Scrollable forms for all screen sizes
