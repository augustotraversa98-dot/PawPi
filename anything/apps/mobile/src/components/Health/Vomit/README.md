# Vomit / Digestive Event Tracker

A comprehensive vomit and digestive event tracking system for monitoring gastrointestinal health in pets.

## Components

### VomitTrackerModal
Main modal for logging vomit/digestive events with two-step flow:
1. Quick choice: "Vomited once" or "Something changed / add details"
2. Detailed form (if needed)

**Features:**
- Quick logging for single, normal events
- Detailed form with all symptoms and observations
- Safety warnings for concerning patterns
- Photo upload capability
- Confirmation feedback

**Fields:**
- Number of episodes: 1, 2, 3, 4+
- Appearance: Food, Foam, Bile/Yellow, Clear liquid, Blood, Other
- Relation to food: Before meal, After meal, Unknown
- Appetite after vomiting: Normal, Reduced, Refused food
- Energy: Normal, Low, Very low
- Diarrhea also present: Yes/No
- Photo (optional)
- Notes (optional)

### VomitDashboard
Summary card showing:
- Last event with time, episodes, appearance, notes preview
- Events today count
- Total episodes today
- Related symptoms (low energy, diarrhea, refused food)
- Concern warnings (if applicable)

### Data Structure (vomitData.js)

**Vomit Log:**
```javascript
{
  id: "vomit001",
  petId: "phoebe",
  timestamp: "2026-05-06T10:30:00Z",
  episodes: 1,
  appearance: "foam",
  relationToFood: "before meal",
  appetiteAfter: "normal",
  energy: "normal",
  diarrheaPresent: false,
  photoUrl: null,
  notes: "",
  isQuickLog: true
}
```

## Safety Guidelines

**Concerning Patterns:**
- Repeated vomiting (2+ events OR 3+ episodes in one day)
- Blood in vomit
- Very low energy
- Vomiting with diarrhea

**Warning Levels:**
- **Standard**: Repeated vomiting (non-urgent pattern)
- **Urgent**: Blood, very low energy, vomiting with diarrhea

**Safety Message:**
"This may need veterinary attention, especially if repeated, severe, or combined with low energy, diarrhea, pain, or refusal to eat."

## Helper Functions

**Data Retrieval:**
- `getTodayVomitLogs()` - All logs from today
- `getLastVomitLog()` - Most recent log
- `getVomitCountToday()` - Count of events today
- `getTotalEpisodesToday()` - Sum of all episodes today
- `getRecentSymptoms()` - Aggregates symptoms from last 3 logs

**Analysis:**
- `hasRecentConcerns()` - Checks last 3 logs for concerning patterns
- `getConcernMessage()` - Generates concern message with urgency level
- `logHasUrgentConcerns()` - Checks single log for urgent concerns
- `logHasConcerns()` - Checks single log for any concerns

**Formatting:**
- `getAppearanceLabel()` - Returns emoji + label (🍖 Food, 💨 Foam, etc.)
- `getAppearanceIndicator()` - Returns appearance emoji only
- `getEnergyLabel()` - Returns formatted energy level
- `getEnergyColor()` - Returns color code for energy level
- `formatRelationToFood()` - Returns formatted timing label
- `formatAppetiteAfter()` - Returns formatted appetite label

## Usage

```javascript
import VomitDashboard from "@/components/Health/Vomit/VomitDashboard";

// In your component
<VomitDashboard />
```

## Timeline Integration

Vomit logs appear in Today's Timeline with:
- 🤮 emoji
- Time stamp
- Number of episodes
- Appearance indicator
- Notes (if any)

## Production Considerations

1. **Database Integration**: Replace mock data with real database
2. **User Authentication**: Associate logs with specific users/pets
3. **Notifications**: Alert on concerning patterns
4. **Trend Analysis**: Weekly/monthly pattern visualization
5. **Vet Export**: Generate shareable reports for veterinary visits
6. **Multi-Pet Support**: Track multiple pets separately
7. **Photo Gallery**: View all uploaded vomit photos in one place
8. **Correlation Detection**: Link to food/treat logs to identify triggers

## Color Coding

- **Orange (#FFB74D)**: Primary vomit tracker theme
- **Red (#FF5733)**: Urgent concern warnings (blood, very low energy, vomiting with diarrhea)
- **Yellow (#FFD54F)**: Standard concern warnings (repeated vomiting)
- **Green (sage)**: Normal/healthy indicators

## Accessibility

- Clear visual hierarchy
- Color-coded indicators with emoji fallbacks
- Descriptive labels
- Touch-friendly button sizes
- Scrollable forms for all screen sizes
- Photo upload with preview and removal

## Appearance Indicators

| Appearance | Emoji | Note |
|------------|-------|------|
| Food | 🍖 | Recently eaten meal |
| Foam | 💨 | White or frothy |
| Bile/Yellow | 🟡 | Empty stomach vomiting |
| Clear liquid | 💧 | Water or saliva |
| Blood | 🔴 | **Urgent concern** |
| Other | ⚫ | Unusual appearance |

## Integration with Other Trackers

- **Poo Tracker**: Cross-reference diarrhea flag
- **Food Tracker**: Identify trigger foods
- **Energy/Activity**: Monitor overall health trends
- **Vet Visits**: Include in medical history reports
