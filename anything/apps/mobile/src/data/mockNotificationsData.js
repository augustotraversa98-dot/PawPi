// ─────────────────────────────────────────────
// MOCK NOTIFICATIONS DATA
// ─────────────────────────────────────────────

export const mockNotifications = [
  // Reminder notifications (NEW - time-sensitive health reminders)
  {
    id: "notif_rem1",
    type: "feeding",
    title: "Feeding o'clock",
    message: "Time to feed Phoebe dinner.",
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    read: false,
    priority: "time_sensitive",
    reminderId: "rem1",
    relatedTracker: "food_water",
    actionLabel: "Log food",
    avatar: null,
  },
  {
    id: "notif_rem4",
    type: "photo_check",
    title: "Paws photo due",
    message:
      "Upload Phoebe's weekly paws photo to compare visible changes over time.",
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    read: false,
    priority: "important",
    reminderId: "rem4",
    relatedTracker: "photo_check",
    relatedBodyArea: "paws",
    actionLabel: "Take photo",
    avatar: null,
  },
  {
    id: "notif_rem2",
    type: "walk",
    title: "Walk time",
    message: "Phoebe's evening walk starts in 15 minutes.",
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
    read: true,
    priority: "time_sensitive",
    reminderId: "rem2",
    relatedTracker: "walk_activity",
    actionLabel: "Start walk",
    avatar: null,
  },
  {
    id: "notif_rem3",
    type: "medication",
    title: "Medication due",
    message: "Phoebe's medication is due now.",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    read: true,
    priority: "time_sensitive",
    reminderId: "rem3",
    relatedTracker: "medication",
    actionLabel: "Mark as given",
    avatar: null,
  },

  // Social notifications (existing)
  {
    id: "notif1",
    type: "paw",
    title: "Alice gave Phoebe a paw",
    message: "Alice loved your daily moment",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    read: false,
    relatedPostId: "post1",
    avatar: "https://i.pravatar.cc/150?img=5",
  },
  {
    id: "notif2",
    type: "bark",
    title: "Charlie barked on Phoebe's post",
    message: '"Such a cutie! 🐶"',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    read: false,
    relatedPostId: "post2",
    avatar: "https://i.pravatar.cc/150?img=12",
  },
  {
    id: "notif3",
    type: "walk",
    title: "Walk time with Phoebe",
    message: "Your social walk starts in 30 minutes",
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    read: true,
    relatedWalkId: "walk1",
    avatar: null,
  },
  {
    id: "notif5",
    type: "paw",
    title: "Your post received 12 new paws",
    message: "Buddy and 11 others gave paws to your daily moment",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    read: true,
    relatedPostId: "post3",
    avatar: "https://i.pravatar.cc/150?img=8",
  },
  {
    id: "notif6",
    type: "training",
    title: "Training time",
    message: "Practice 'sit' with Phoebe today",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    read: true,
    avatar: null,
  },
  {
    id: "notif7",
    type: "walk",
    title: "Max and Luna joined your walk",
    message: "They joined your walk at Riverside Park",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    read: true,
    relatedWalkId: "walk2",
    avatar: "https://i.pravatar.cc/150?img=14",
  },
  {
    id: "notif8",
    type: "training",
    title: "You are on a 3-day training streak",
    message: "Keep going! Practice again tomorrow",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    read: true,
    avatar: null,
  },
  {
    id: "notif9",
    type: "bark",
    title: "Luna replied to your daily moment",
    message: '"Love this! 💕"',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    read: true,
    relatedPostId: "post1",
    avatar: "https://i.pravatar.cc/150?img=9",
  },
];
