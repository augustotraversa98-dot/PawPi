# Walk, Activity, and Mobility Tracker

A comprehensive walk tracking, mobility monitoring, and social walk scheduling system for monitoring physical activity and joint health.

## Components

### WalkActivityModal
Main modal with four-step flow:
1. Quick choice screen: Start walk, Log walk manually, Schedule social walk, Log mobility issue
2. Walk log form (if manual)
3. Mobility check form
4. Social walk scheduling form

**Features:**
- Quick walk start (for real-time tracking)
- Manual walk logging
- Mobility issue tracking with safety warnings
- Social walk scheduling with nearby pet invitations
- Photo-free design (focuses on metrics and observations)
- Confirmation feedback
- Mobility warnings when concerns are detected

### WalkActivityDashboard
Summary card showing:
- Walks today count
- Total duration today
- Total distance today
- Last walk details (time, duration, distance, pace, energy, potty events, location, notes)
- Recent mobility check (date, issues summary, notes)
- Upcoming social walk (date, time, location, duration, pace, attendees)
- Mobility warning alert (if concerns detected)

### Data Structure (walkActivityData.js)

**Walk Log:**
```javascript
{
  id: "walk001",
  petId: "phoebe",
  timestamp: "2026-05-06T07:30:00Z",
  duration: 25, // minutes
  distance: 1.2, // miles
  pace: "normal", // relaxed | normal | active
  energyAfter: "high", // low | normal | high
  pottyEvents: {
    poo: 1,
    pee: 2
  },
  route: "Park loop",
  location: "Riverside Park",
  notes: "Met some friendly dogs",
  isActive: false // true = walk in progress
}
```

**Mobility Check:**
```javascript
{
  id: "mobility001",
  petId: "phoebe",
  timestamp: "2026-05-04T16:20:00Z",
  limping: false,
  stiffness: true,
  difficultyStanding: false,
  difficultyStairsJumping: false,
  painSigns: false,
  notes: "Slight stiffness after long nap"
}
```

**Social Walk:**
```javascript
{
  id: "social001",
  petId: "phoebe",
  hostName: "Phoebe",
  date: "2026-05-08",
  time: "10:00 AM",
  meetingLocation: "Riverside Park - Main Entrance",
  duration: 45,
  pace: "normal",
  visibility: "nearby pets", // "friends only" | "nearby pets"
  maxPets: 5,
  notes: "Bringing tennis balls!",
  attendees: [
    { petName: "Max", ownerName: "Sarah" },
    { petName: "Luna", ownerName: "James" }
  ]
}
```

## Walk Log Fields

| Field | Type | Options | Note |
|-------|------|---------|------|
| Duration | Number | Minutes | User input |
| Distance | Number | Miles | User input |
| Pace | Enum | Relaxed, Normal, Active | Button selection |
| Energy after | Enum | Low, Normal, High | Button selection |
| Potty events - Poo | Number | 0, 1, 2, 3 | Tap counter |
| Potty events - Pee | Number | 0, 1, 2, 3 | Tap counter |
| Route | String | Optional | Text input |
| Location | String | Optional | Text input |
| Notes | String | Optional | Multi-line text input |

## Mobility Check Fields

| Field | Type | Options | Safety Flag |
|-------|------|---------|-------------|
| Limping | Boolean | Yes, No | ⚠️ Warning |
| Stiffness | Boolean | Yes, No | 📝 Note |
| Difficulty standing | Boolean | Yes, No | ⚠️ Warning |
| Difficulty with stairs/jumping | Boolean | Yes, No | ⚠️ Warning |
| Pain signs | Boolean | Yes, No | ⚠️ Warning |
| Notes | String | Optional | - |

## Social Walk Fields

| Field | Type | Options | Note |
|-------|------|---------|------|
| Date | String | YYYY-MM-DD | Text input (future: date picker) |
| Time | String | e.g., "10:00 AM" | Text input (future: time picker) |
| Meeting location | String | Required | Text input (future: map picker) |
| Duration | Number | Minutes | Numeric input |
| Pace | Enum | Relaxed, Normal, Active | Button selection |
| Visibility | Enum | Friends only, Nearby pets | Button selection |
| Max pets | Number | 3, 5, 8, 10 | Button selection |
| Notes | String | Optional | Multi-line text input |

## Safety Guidelines

**Mobility Concerns:**
If any of these are logged:
- Limping
- Pain signs
- Sudden mobility change (new issue after recent normal check)
- Difficulty moving (standing, stairs, jumping)

**Warning Message:**
"This change may be worth monitoring. Contact your vet if it continues, worsens, or your dog seems painful."

**Warning Level:**
- Standard (orange): All mobility concerns use the same warning level
- No urgent tier for mobility (unlike vomit tracker)

## Helper Functions

**Walk Data:**
- `getTodayWalkLogs()` - All walks from today
- `getLastWalkLog()` - Most recent walk
- `getWalkCountToday()` - Count of walks today
- `getTotalDurationToday()` - Sum of all walk durations today
- `getTotalDistanceToday()` - Sum of all walk distances today
- `formatDuration(minutes)` - Formats duration as "25 min" or "1h 30m"
- `formatDistance(miles)` - Formats distance as "1.2 mi" or "500 ft"

**Mobility Data:**
- `getLastMobilityCheck()` - Most recent mobility check
- `hasRecentMobilityIssues()` - Checks last 3 checks for issues
- `getMobilityWarningMessage(issues)` - Returns warning message if concerns present
- `mobilityHasConcerns(check)` - Checks if a single check has any concerns
- `getMobilityIssueSummary(check)` - Returns comma-separated list of issues

**Social Walk Data:**
- `getUpcomingSocialWalks()` - All future social walks sorted by date
- `getNextSocialWalk()` - Next upcoming social walk
- `formatSocialWalkDate(dateString)` - Returns "Today", "Tomorrow", or formatted date
- `addSocialWalk(walkData)` - Creates new social walk

**Pace & Energy:**
- `getPaceLabel(pace)` - Returns formatted pace label
- `getPaceEmoji(pace)` - Returns emoji (🐢 Relaxed, 🐕 Normal, 🏃 Active)
- `getPaceColor(pace)` - Returns color code for pace
- `getEnergyEmoji(energy)` - Returns emoji (😴 Low, 😊 Normal, ⚡ High)
- `getEnergyColor(energy)` - Returns color code for energy

**Potty Events:**
- `walkHasPottyEvents(walk)` - Checks if walk has any potty events
- `formatPottyEvents(pottyEvents)` - Returns formatted string (e.g., "1 💩, 2 💦")

## Usage

```javascript
import WalkActivityDashboard from "@/components/Health/WalkActivity/WalkActivityDashboard";

// In your component
<WalkActivityDashboard />
```

## Timeline Integration

**Walk logs appear in Today's Timeline:**
- 🚶 emoji
- Time stamp
- Duration, distance, pace (e.g., "25 min • 1.2 mi • 🐕 Normal")
- Energy after (e.g., "⚡ high energy after")
- Potty events (e.g., "1 💩, 2 💦")
- Location/route (if provided)
- Notes (if provided)

**Mobility checks appear in Today's Timeline:**
- 🦴 emoji
- Time stamp
- Issues summary (e.g., "stiffness, limping") or "All movement normal"
- Notes (if provided)

## Production Considerations

1. **Real-time Walk Tracking**: Implement GPS tracking, timer, and auto-distance calculation
2. **Database Integration**: Replace mock data with backend API
3. **Map Integration**: Use `@vis.gl/react-google-maps` for route visualization and location picker
4. **Date/Time Pickers**: Replace text inputs with proper date/time picker components
5. **Social Walk Invitations**: Build notification system for nearby pet invitations
6. **Social Walk Attendance**: Allow pets to RSVP and manage attendee list
7. **Activity Goals**: Set daily walk goals (duration, distance, frequency)
8. **Trend Analysis**: Weekly/monthly walk statistics and charts
9. **Weather Integration**: Show weather conditions for outdoor planning
10. **Route Library**: Save and reuse favorite walking routes
11. **Mobility Trends**: Track mobility over time with charts
12. **Vet Export**: Generate mobility reports for veterinary visits
13. **Photo Integration**: Allow walk photos (scenery, met friends, etc.)

## Color Coding

- **Coral (#FF6F61)**: Primary walk/activity theme
- **Light Blue (#64B5F6)**: Social walk theme
- **Orange (#FFB74D)**: Mobility warnings
- **Brown (#8D6E63)**: Poo events
- **Blue (#42A5F5)**: Pee events
- **Green (sage)**: Normal/healthy indicators
- **Purple (#9575CD)**: Relaxed pace
- **Red (coral)**: Active pace

## Accessibility

- Clear visual hierarchy
- Color-coded pace/energy indicators with emoji fallbacks
- Descriptive labels for all fields
- Touch-friendly button sizes (especially potty event counters)
- Scrollable forms for all screen sizes
- Yes/No toggle buttons for mobility checks

## Pace Indicators

| Pace | Emoji | Color | Note |
|------|-------|-------|------|
| Relaxed | 🐢 | Purple (#9575CD) | Leisurely stroll |
| Normal | 🐕 | Blue (#42A5F5) | Standard walking pace |
| Active | 🏃 | Coral (#FF6F61) | Brisk walk or light jog |

## Energy Indicators

| Energy | Emoji | Color | Note |
|--------|-------|-------|------|
| Low | 😴 | Orange (#FFB74D) | Tired after walk |
| Normal | 😊 | Sage (#A7BFA3) | Normal energy level |
| High | ⚡ | Coral (#FF6F61) | Energized and ready for more |

## Integration with Other Trackers

- **Poo Tracker**: Potty events link to poo logs
- **Pee Tracker**: Potty events link to pee logs
- **Food Tracker**: Monitor relationship between meals and walk energy
- **Vet Visits**: Include walk frequency and mobility in vet reports
- **Social Feed**: Share walk routes and social walk invitations

## Future Enhancements

1. **Walk Streaks**: Track consecutive days with walks
2. **Badge System**: Earn badges for walk milestones
3. **Leaderboards**: Compare walk stats with friends
4. **Route Sharing**: Share favorite routes with community
5. **Walk Challenges**: Join community walking challenges
6. **Weather Alerts**: Get notified of good walking weather
7. **Breed-Specific Goals**: Suggest walk duration based on breed
8. **Age-Adjusted Recommendations**: Adjust goals for senior dogs
9. **Joint Health Monitoring**: Correlate mobility issues with walk intensity
10. **Rehabilitation Tracking**: Monitor recovery progress after injury

## Social Walk Visibility Options

| Option | Description |
|--------|-------------|
| **Friends only** | Only visible to your connected friends |
| **Nearby pets** | Visible to all pets within a certain radius (e.g., 5 miles) |

## Max Pets Options

3, 5, 8, or 10 pets (including host)

Smaller groups (3-5) for better control and socialization
Larger groups (8-10) for park meetups and social events
