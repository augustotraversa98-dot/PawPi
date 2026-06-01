// ─────────────────────────────────────────────
// MOCK CONVERSATIONS AND MESSAGES DATA
// ─────────────────────────────────────────────

export const mockConversations = [
  {
    id: "conv1",
    petName: "Buddy",
    ownerName: "Alice",
    avatar: "https://i.pravatar.cc/150?img=5",
    petAvatar:
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    lastMessage: "See you at the park tomorrow!",
    lastMessageTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    unread: true,
  },
  {
    id: "conv2",
    petName: "Luna",
    ownerName: "Sarah",
    avatar: "https://i.pravatar.cc/150?img=9",
    petAvatar:
      "https://images.unsplash.com/photo-1477884213360-7e9d7dcc1e48?w=400",
    lastMessage: "Luna loved playing with Phoebe!",
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    unread: false,
  },
  {
    id: "conv3",
    petName: "Max & Charlie",
    ownerName: "Tom",
    avatar: "https://i.pravatar.cc/150?img=12",
    petAvatar:
      "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400",
    lastMessage: "Thanks for the walk tips!",
    lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    unread: false,
  },
  {
    id: "conv4",
    petName: "Bella",
    ownerName: "Emma",
    avatar: "https://i.pravatar.cc/150?img=24",
    petAvatar:
      "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400",
    lastMessage: "Sent a photo",
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    unread: false,
  },
];

export const mockMessages = {
  conv1: [
    {
      id: "msg1",
      conversationId: "conv1",
      senderId: "user2",
      senderName: "Alice",
      text: "Hey! Buddy had so much fun today!",
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "msg2",
      conversationId: "conv1",
      senderId: "user1",
      senderName: "You",
      text: "Phoebe too! She's been so happy 🐕",
      timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "msg3",
      conversationId: "conv1",
      senderId: "user2",
      senderName: "Alice",
      text: "Should we meet up tomorrow?",
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "msg4",
      conversationId: "conv1",
      senderId: "user2",
      senderName: "Alice",
      text: "See you at the park tomorrow!",
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      read: false,
    },
  ],
  conv2: [
    {
      id: "msg5",
      conversationId: "conv2",
      senderId: "user3",
      senderName: "Sarah",
      text: "Luna loved playing with Phoebe!",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "msg6",
      conversationId: "conv2",
      senderId: "user1",
      senderName: "You",
      text: "Same here! Let's do it again soon",
      timestamp: new Date(
        Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000,
      ).toISOString(),
      read: true,
    },
  ],
  conv3: [
    {
      id: "msg7",
      conversationId: "conv3",
      senderId: "user1",
      senderName: "You",
      text: "Max looks great in your latest post!",
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "msg8",
      conversationId: "conv3",
      senderId: "user4",
      senderName: "Tom",
      text: "Thanks for the walk tips!",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      read: true,
    },
  ],
  conv4: [
    {
      id: "msg9",
      conversationId: "conv4",
      senderId: "user5",
      senderName: "Emma",
      text: "Sent a photo",
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      read: true,
      image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400",
    },
  ],
};
