// Mock data and state for Food & Water tracking
// In a production app, this would be connected to a database

export const foodWaterLogs = [
  {
    id: "fw001",
    petId: "sample-pet",
    type: "food",
    timestamp: "2026-05-06T07:15:00Z",
    mealType: "breakfast",
    foodName: "Royal Canin Adult Dog Food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
    notes: "",
    isDefault: true,
  },
  {
    id: "fw002",
    petId: "sample-pet",
    type: "food",
    timestamp: "2026-05-06T12:30:00Z",
    mealType: "snack",
    foodName: "Training treats",
    amount: "5 treats",
    appetite: "high",
    finishedMeal: "yes",
    vomiting: false,
    notes: "During training session",
    isDefault: false,
  },
  {
    id: "fw003",
    petId: "sample-pet",
    type: "water",
    timestamp: "2026-05-06T09:00:00Z",
    waterIntake: "normal",
    moreThirsty: false,
    lessThirsty: false,
    notes: "",
  },
  {
    id: "fw004",
    petId: "sample-pet",
    type: "food",
    timestamp: "2026-05-05T18:45:00Z",
    mealType: "dinner",
    foodName: "Royal Canin Adult Dog Food",
    amount: "1 cup",
    appetite: "low",
    finishedMeal: "partially",
    vomiting: false,
    notes: "Left about 1/4 of the bowl",
    isDefault: false,
  },
  {
    id: "fw005",
    petId: "sample-pet",
    type: "food",
    timestamp: "2026-05-05T07:00:00Z",
    mealType: "breakfast",
    foodName: "Royal Canin Adult Dog Food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
    notes: "",
    isDefault: true,
  },
  {
    id: "fw006",
    petId: "sample-pet",
    type: "water",
    timestamp: "2026-05-05T14:20:00Z",
    waterIntake: "high",
    moreThirsty: true,
    lessThirsty: false,
    notes: "Drank more after walk",
  },
];

// Default meal configuration
export const defaultMeal = {
  breakfast: {
    foodName: "Royal Canin Adult Dog Food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
  lunch: {
    foodName: "Royal Canin Adult Dog Food",
    amount: "0.5 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
  dinner: {
    foodName: "Royal Canin Adult Dog Food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
};

// Helper functions
export const getTodayFoodLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return foodWaterLogs.filter(
    (log) => log.type === "food" && log.timestamp.startsWith(today),
  );
};

export const getTodayWaterLogs = () => {
  const today = new Date().toISOString().split("T")[0];
  return foodWaterLogs.filter(
    (log) => log.type === "water" && log.timestamp.startsWith(today),
  );
};

export const getMealsToday = () => {
  return getTodayFoodLogs().filter((log) =>
    ["breakfast", "lunch", "dinner"].includes(log.mealType),
  );
};

export const getSnacksToday = () => {
  return getTodayFoodLogs().filter((log) =>
    ["snack", "treat"].includes(log.mealType),
  );
};

export const getLastMeal = () => {
  const foodLogs = foodWaterLogs.filter((log) => log.type === "food");
  return foodLogs.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  )[0];
};

export const getRecentAppetiteTrend = () => {
  const recentMeals = foodWaterLogs
    .filter(
      (log) =>
        log.type === "food" &&
        ["breakfast", "lunch", "dinner"].includes(log.mealType),
    )
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  const lowAppetiteCount = recentMeals.filter(
    (meal) => meal.appetite === "low",
  ).length;

  if (lowAppetiteCount >= 3) {
    return "low";
  } else if (lowAppetiteCount >= 1) {
    return "monitoring";
  }

  return "normal";
};

export const getNextFeedingTime = () => {
  const now = new Date();
  const currentHour = now.getHours();

  // Default feeding times: 7 AM, 12 PM, 7 PM
  const feedingTimes = [
    { hour: 7, label: "Breakfast", time: "7:00 AM" },
    { hour: 12, label: "Lunch", time: "12:00 PM" },
    { hour: 19, label: "Dinner", time: "7:00 PM" },
  ];

  for (const feeding of feedingTimes) {
    if (currentHour < feeding.hour) {
      return feeding;
    }
  }

  // If past all feeding times, return tomorrow's breakfast
  return { hour: 7, label: "Breakfast", time: "7:00 AM (tomorrow)" };
};

// Add new food log
export const addFoodLog = (logData) => {
  const newLog = {
    id: `fw${Date.now()}`,
    petId: "sample-pet",
    type: "food",
    timestamp: new Date().toISOString(),
    ...logData,
  };
  foodWaterLogs.unshift(newLog);
  return newLog;
};

// Add new water log
export const addWaterLog = (logData) => {
  const newLog = {
    id: `fw${Date.now()}`,
    petId: "sample-pet",
    type: "water",
    timestamp: new Date().toISOString(),
    ...logData,
  };
  foodWaterLogs.unshift(newLog);
  return newLog;
};
