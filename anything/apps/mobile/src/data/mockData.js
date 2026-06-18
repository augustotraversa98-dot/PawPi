export const VETS = [
  {
    id: "1",
    name: "Happy Paws Veterinary",
    address: "123 Bark Avenue, Dogtown",
    distance: "0.8 km",
    rating: 4.8,
  },
  {
    id: "2",
    name: "City Pet Hospital",
    address: "456 Tail Street, Woofville",
    distance: "2.1 km",
    rating: 4.5,
  },
  {
    id: "3",
    name: "Whiskers & Wag Clinic",
    address: "789 Paws Lane, Pet City",
    distance: "3.5 km",
    rating: 4.9,
  },
  {
    id: "4",
    name: "Sunrise Animal Care",
    address: "22 Golden Street, Parkside",
    distance: "4.2 km",
    rating: 4.7,
  },
];

export const ADOPTABLE_DOGS = [
  {
    id: "1",
    name: "Luna",
    age: "2 years",
    breed: "Golden Retriever Mix",
    shelter: "Safe Haven Rescue",
    location: "Dogtown",
    tags: ["Friendly", "Active", "Kids OK"],
    image:
      "https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "2",
    name: "Max",
    age: "4 years",
    breed: "Beagle",
    shelter: "Paws & Claws Shelter",
    location: "Woofville",
    tags: ["Calm", "Snuggler", "Leash trained"],
    image:
      "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "3",
    name: "Coco",
    age: "1 year",
    breed: "Labrador Mix",
    shelter: "City Rescue Centre",
    location: "Riverside",
    tags: ["Playful", "Energetic", "Loves walks"],
    image:
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "4",
    name: "Daisy",
    age: "5 years",
    breed: "Border Collie",
    shelter: "Forever Home Shelter",
    location: "Parkside",
    tags: ["Smart", "Gentle", "Trained"],
    image:
      "https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=500&auto=format&fit=crop",
  },
];

export const SHOP_PRODUCTS = [
  {
    id: "1",
    name: "Premium Puppy Kibble",
    category: "Food",
    price: "$45.99",
    image:
      "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "2",
    name: "Indestructible Chew Toy",
    category: "Toys",
    price: "$12.50",
    image:
      "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "3",
    name: "Organic Calming Treats",
    category: "Treats",
    price: "$18.00",
    image:
      "https://images.unsplash.com/photo-1544433480-e44299d81961?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "4",
    name: "Adjustable Harness",
    category: "Accessories",
    price: "$32.00",
    image:
      "https://images.unsplash.com/photo-1601758003122-53c40e686a19?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "5",
    name: "Omega-3 Supplement",
    category: "Health",
    price: "$22.99",
    image:
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=500&auto=format&fit=crop",
  },
  {
    id: "6",
    name: "Squeaky Plush Fox",
    category: "Toys",
    price: "$9.99",
    image:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=500&auto=format&fit=crop",
  },
];


// Mock walk logs (for future database integration)
export const MOCK_WALK_LOGS = [
  {
    id: "1",
    date: "Today",
    time: "6:30 PM",
    duration: "45 min",
    distance: "2.8 km",
    pace: "Moderate",
    energy: "High",
    pottyEvents: 2,
    notes: "Great walk, lots of sniffing",
    isSocialWalk: false,
  },
  {
    id: "2",
    date: "Yesterday",
    time: "8:00 AM",
    duration: "30 min",
    distance: "1.5 km",
    pace: "Brisk",
    energy: "Normal",
    pottyEvents: 1,
    notes: "Quick morning walk",
    isSocialWalk: true,
    socialDetails: {
      location: "Riverside Park",
      joinedPets: 3,
      visibility: "Nearby pets",
    },
  },
];

// Mock health logs (for future database integration)
export const MOCK_POO_LOGS = [
  {
    id: "1",
    time: "8:30 AM",
    date: "Today",
    amount: "Medium",
    shape: "Normal",
    color: "Brown",
    duration: "1 min",
    blood: "No",
    notes: "Normal and healthy",
    hasPhoto: false,
  },
  {
    id: "2",
    time: "6:00 PM",
    date: "Yesterday",
    amount: "Small",
    shape: "Normal",
    color: "Brown",
    duration: "1 min",
    blood: "No",
    notes: "",
    hasPhoto: false,
  },
];

export const MOCK_FOOD_LOGS = [
  {
    id: "1",
    time: "7:15 AM",
    date: "Today",
    mealType: "Breakfast",
    foodName: "Royal Canin Adult",
    amount: "1 cup",
    appetite: "Good",
    water: "1.5 cups",
    notes: "Enjoyed every bite",
  },
  {
    id: "2",
    time: "12:30 PM",
    date: "Today",
    mealType: "Snack",
    foodName: "Carrot sticks",
    amount: "A few pieces",
    appetite: "Normal",
    water: "0.5 cups",
    notes: "Healthy midday snack",
  },
];
