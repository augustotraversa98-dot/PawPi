# Vet Summary Feature

## Overview
The Vet Summary feature helps pet owners prepare for veterinarian visits by generating a clean, comprehensive summary from recent health tracking logs.

## Components

### VetSummaryDashboard
- Entry point for the feature
- Shows quick stats about recent activity
- Button to create a new vet summary

### VetSummaryModal
- Main interface for creating and customizing summaries
- Features:
  - Time range selector (7/14/30 days, custom)
  - Photo selection interface
  - Questions for vet editor
  - Preview functionality
  - Download PDF (placeholder)
  - Share with vet (placeholder)

## Features

### Time Range Options
- Last 7 days
- Last 14 days
- Last 30 days
- Custom range (future implementation)

### Summary Sections
- Main concerns
- Appetite changes
- Food and water logs
- Poo and pee changes
- Vomiting events
- Activity and mobility changes
- Medication history
- Photo checks attached
- Questions for the vet
- Timeline of relevant events

### Photo Attachment
Allows selection of Photo Checks by body part:
- Paws (last 6 weeks)
- Skin/Fur (last 30 days)
- Teeth (last 3 months)
- Eyes (last 30 days)

### Export & Sharing
- Preview summary
- Download PDF (placeholder)
- Share with vet (placeholder)

## Data Sources
Currently uses mock data from:
- Food/Water tracker
- Poo/Pee tracker
- Vomiting tracker
- Walk/Activity tracker
- Medication tracker
- Photo Check history

## Future Integration
- Connect to real tracker data from Zustand store
- Implement PDF generation
- Add real sharing functionality with veterinarians
- Custom date range picker
- Save/edit summary drafts
- Automatic timeline generation from all health logs

## Usage
The Vet Summary is accessible from the Vet Record tab in the Health section. It appears as a card at the top of the screen, before the Pet Medical Profile.
