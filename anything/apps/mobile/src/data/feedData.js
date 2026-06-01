// Shared feed mock data — structured for future database integration

export const MOCK_POSTS = [
  {
    id: "1",
    dogName: "Buddy",
    ownerName: "Alice",
    ownerAvatar: "https://i.pravatar.cc/150?img=5",
    breed: "Pug",
    age: "3 years",
    location: "Central Park, NYC",
    bio: "Professional stick finder. Nap expert. Park enthusiast. 🌿",
    caption:
      "Found the biggest stick in the park today 🌿🪵 Best day ever, 10/10 would fetch again!",
    photo:
      "https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=800&auto=format&fit=crop",
    paws: 24,
    barks: 3,
    timestamp: "1h ago",
    avatar:
      "https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=200&auto=format&fit=crop",
    tag: "Daily moment",
    totalPosts: 42,
    totalPaws: 389,
    totalBarks: 78,
    friends: 61,
    comments: [
      {
        id: "c1",
        author: "Luna 🐕",
        authorAvatar:
          "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?q=80&w=100&auto=format&fit=crop",
        text: "That stick is almost as big as you, Buddy! 😂🐾",
        time: "45m ago",
      },
      {
        id: "c2",
        author: "Mochi 🐩",
        authorAvatar:
          "https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=100&auto=format&fit=crop",
        text: "10/10 stick rating from me too! Woof! 🎉",
        time: "20m ago",
      },
    ],
    pastPosts: [
      {
        id: "p1a",
        photo:
          "https://images.unsplash.com/photo-1508532566027-b2579a8a1939?q=80&w=400&auto=format&fit=crop",
        paws: 18,
        timestamp: "Yesterday",
      },
      {
        id: "p1b",
        photo:
          "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=400&auto=format&fit=crop",
        paws: 31,
        timestamp: "2 days ago",
      },
      {
        id: "p1c",
        photo:
          "https://images.unsplash.com/photo-1551717743-8f5b868a2e63?q=80&w=400&auto=format&fit=crop",
        paws: 27,
        timestamp: "3 days ago",
      },
    ],
  },
  {
    id: "2",
    dogName: "Luna",
    ownerName: "Charlie",
    ownerAvatar: "https://i.pravatar.cc/150?img=12",
    breed: "Golden Retriever",
    age: "2 years",
    location: "Riverside, Portland",
    bio: "Golden hour lover. Beach babe. Will work for belly rubs. 🌊",
    caption:
      "Afternoon nap in the golden hour sun ☀️ She deserves it after our 5km walk this morning 🐾",
    photo:
      "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?q=80&w=800&auto=format&fit=crop",
    paws: 42,
    barks: 5,
    timestamp: "3h ago",
    avatar:
      "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?q=80&w=200&auto=format&fit=crop",
    tag: "Best day!",
    totalPosts: 67,
    totalPaws: 1240,
    totalBarks: 203,
    friends: 88,
    comments: [
      {
        id: "c3",
        author: "Buddy 🐶",
        authorAvatar:
          "https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=100&auto=format&fit=crop",
        text: "Luna you are literally glowing! ☀️🐾",
        time: "2h ago",
      },
      {
        id: "c4",
        author: "Coco 🤎",
        authorAvatar:
          "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=100&auto=format&fit=crop",
        text: "5km?! You're a champion 🏆",
        time: "1h ago",
      },
    ],
    pastPosts: [
      {
        id: "p2a",
        photo:
          "https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=400&auto=format&fit=crop",
        paws: 55,
        timestamp: "Yesterday",
      },
      {
        id: "p2b",
        photo:
          "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=400&auto=format&fit=crop",
        paws: 39,
        timestamp: "2 days ago",
      },
    ],
  },
  {
    id: "3",
    dogName: "Mochi",
    ownerName: "Priya",
    ownerAvatar: "https://i.pravatar.cc/150?img=47",
    breed: "Shiba Inu",
    age: "4 years",
    location: "Mission District, SF",
    bio: "First swim legend. Foodie. Very opinionated about squirrels. 🐿️",
    caption:
      "First swim of the season! 🌊 She absolutely loves the water now 💙",
    photo:
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=800&auto=format&fit=crop",
    paws: 67,
    barks: 9,
    timestamp: "5h ago",
    avatar:
      "https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=200&auto=format&fit=crop",
    tag: "Top paws",
    totalPosts: 91,
    totalPaws: 2801,
    totalBarks: 412,
    friends: 134,
    comments: [
      {
        id: "c5",
        author: "Buddy 🐶",
        authorAvatar:
          "https://images.unsplash.com/photo-1544568100-847a948585b9?q=80&w=100&auto=format&fit=crop",
        text: "Mochi is literally a water goddess 🌊🐾",
        time: "4h ago",
      },
      {
        id: "c6",
        author: "Luna 🐕",
        authorAvatar:
          "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?q=80&w=100&auto=format&fit=crop",
        text: "Teach me your ways!! 🏊",
        time: "3h ago",
      },
      {
        id: "c7",
        author: "Daisy 🌸",
        authorAvatar:
          "https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=100&auto=format&fit=crop",
        text: "She's so brave! I hate water 😂",
        time: "2h ago",
      },
    ],
    pastPosts: [
      {
        id: "p3a",
        photo:
          "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=400&auto=format&fit=crop",
        paws: 72,
        timestamp: "Yesterday",
      },
      {
        id: "p3b",
        photo:
          "https://images.unsplash.com/photo-1508532566027-b2579a8a1939?q=80&w=400&auto=format&fit=crop",
        paws: 44,
        timestamp: "2 days ago",
      },
      {
        id: "p3c",
        photo:
          "https://images.unsplash.com/photo-1551717743-8f5b868a2e63?q=80&w=400&auto=format&fit=crop",
        paws: 81,
        timestamp: "3 days ago",
      },
    ],
  },
];
