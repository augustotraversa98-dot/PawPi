# Medication, Vaccines, and Preventive Care Components

Comprehensive medication tracking, vaccine management, and preventive care system for pet health.

## Components

### `MedicationDashboard.jsx`
Main dashboard showing:
- Next upcoming dose
- Missed doses alert
- Overdue vaccines/preventives alert
- Quick access to medications, vaccines, preventives
- Current medication count

### `MedicationModal.jsx`
Tabbed modal for managing:
1. **Medications** - current and past
2. **Vaccines** - complete vaccine history
3. **Preventive Care** - flea, tick, heartworm, supplements

## Data File

### `medicationData.js`
Manages all medication-related data:
- Current medications
- Past medications
- Vaccines with due dates
- Preventive treatments
- Dose tracking (taken/missed)
- Helper functions for queries

## Features

### Medications
**Fields:**
- Name, dose, frequency
- Start/end date
- Prescribed by
- Taken today: Yes/No
- Missed dose tracking
- Side effects
- Notes
- Reminder toggle

**Actions:**
- Mark doses as taken
- Mark as completed (moves to past)
- Enable/disable reminders

### Vaccines
**Fields:**
- Vaccine name
- Date given
- Expiration/due date
- Vet clinic
- Document/photo upload (placeholder)
- Notes
- Reminder toggle

**Status badges:**
- Current (green)
- Due soon (orange, within 60 days)
- Overdue (red)

### Preventive Care
**Types:**
- Flea prevention
- Tick prevention
- Heartworm prevention
- Flea, Tick & Heartworm combo
- Dewormer
- Supplement
- Other

**Fields:**
- Product name
- Type
- Last given
- Next due
- Frequency
- Notes
- Reminder toggle

**Status badges:**
- On schedule (green)
- Due soon (orange, within 7 days)
- Overdue (red)

### Safety
- Clear warning: "Follow your veterinarian's instructions for medication dose and schedule."
- No dosing advice provided by the app
- Educational only

### Reminders
- Medication reminders
- Vaccine reminders
- Preventive care reminders
- Toggle on/off per item

## Usage

```jsx
import { MedicationDashboard } from '@/components/Health/Medication';

<MedicationDashboard />
```

## Design

- Color-coded by category (medications = purple, vaccines = teal, preventives = orange)
- Status badges for at-a-glance health
- Alert banners for overdue items
- Quick action buttons
- Tabbed interface for organization

## Integration

- Connects with Today's Timeline
- Integrates with Vet Records
- Part of Health Track section
