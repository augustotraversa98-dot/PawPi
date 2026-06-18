// trainingCurriculum.js — the DIY self-training curriculum (ticket 2.45).
//
// This is CURATED CONTENT (not user data, so no "fake data" concern): a structured,
// research-backed program set modeled on reputable positive-reinforcement sources (AKC
// foundation/obedience guidance, the AKC S.T.A.R. Puppy / Canine Good Citizen skill set,
// and standard force-free trainer curricula). Owners work through ordered sessions per pet;
// completion is the only thing persisted (training_progress_self, 0048).
//
// Keys (program.key / session.key) are STABLE — progress rows reference them; never rename a
// key (add new ones instead). difficulty ∈ Beginner | Intermediate | Advanced.

export const TRAINING_PROGRAMS = [
  {
    key: "puppy-essentials",
    title: "Puppy Essentials",
    emoji: "🐶",
    difficulty: "Beginner",
    summary:
      "The first month with a new puppy: name recognition, handling, potty routine, crate comfort, and gentle bite inhibition — the foundation everything else builds on.",
    sessions: [
      {
        key: "name-recognition",
        title: "Name recognition & the marker",
        durationMin: 5,
        difficulty: "Beginner",
        objective:
          "Teach your puppy that their name means 'look at me, good things follow', and introduce a marker word ('yes') or clicker.",
        steps: [
          "In a quiet room, say your puppy's name once in a bright tone.",
          "The instant they look toward you, mark with 'yes!' and give a small treat.",
          "Repeat 8–10 times, then take a break. Never repeat the name over and over.",
          "Practice in 2–3 short sessions a day, gradually adding mild distractions.",
        ],
        tips: [
          "Keep treats tiny (pea-sized) so you can do many reps.",
          "If they don't respond, you're too far or too distracting — make it easier.",
        ],
      },
      {
        key: "handling-touch",
        title: "Gentle handling & body touch",
        durationMin: 5,
        difficulty: "Beginner",
        objective:
          "Build positive associations with being touched on paws, ears, mouth, and collar — essential for vet visits and grooming.",
        steps: [
          "Touch a paw briefly, mark, and treat. Repeat for ears, then gently lift a lip.",
          "Pair every touch with a treat so handling predicts good things.",
          "Slowly increase how long you hold each touch.",
          "Practice a quick collar-grab + treat so being held is never scary.",
        ],
        tips: ["Stop before your puppy gets squirmy — end on a calm note."],
      },
      {
        key: "potty-routine",
        title: "Potty-training routine",
        durationMin: 10,
        difficulty: "Beginner",
        objective:
          "Establish a predictable schedule and reward system so your puppy learns where to go.",
        steps: [
          "Take your puppy out after waking, eating, playing, and every 1–2 hours.",
          "Go to the same spot; wait quietly and let them sniff.",
          "The moment they finish, mark and reward warmly right there.",
          "Supervise indoors; clean accidents with an enzymatic cleaner (no scolding).",
        ],
        tips: [
          "A young puppy can hold it roughly one hour per month of age.",
          "Reward OUTSIDE, not after coming back in — timing teaches the location.",
        ],
      },
      {
        key: "crate-comfort",
        title: "Crate as a safe den",
        durationMin: 10,
        difficulty: "Beginner",
        objective:
          "Make the crate a cozy, voluntary resting place — never a punishment.",
        steps: [
          "Toss treats inside and let your puppy go in and out freely.",
          "Feed meals in the crate with the door open.",
          "Close the door for a few seconds, then build up while you stay nearby.",
          "Add a chew toy and a soft bed; keep first closed sessions short.",
        ],
        tips: ["If they whine, you increased duration too fast — back up a step."],
      },
      {
        key: "bite-inhibition",
        title: "Bite inhibition & mouthing",
        durationMin: 5,
        difficulty: "Beginner",
        objective:
          "Teach your puppy to use a soft mouth and redirect nipping onto toys.",
        steps: [
          "When teeth touch skin, calmly say 'ouch' and stop play for a moment.",
          "Redirect immediately to an appropriate chew toy.",
          "Reward gentle play and chewing on toys.",
          "Keep play sessions short to avoid over-arousal nipping.",
        ],
        tips: ["Never wrestle with hands — it teaches hands are toys."],
      },
      {
        key: "settle-on-mat",
        title: "Settle on a mat",
        durationMin: 8,
        difficulty: "Beginner",
        objective: "Teach a 'go relax here' spot for calmness at home.",
        steps: [
          "Place a mat down; reward any interaction with it.",
          "Reward lying down on the mat with calm, slow treats.",
          "Add a cue like 'place' as they step on reliably.",
          "Gradually reward longer settles and add a release word.",
        ],
        tips: ["Deliver treats low and slow to encourage a relaxed body."],
      },
    ],
  },
  {
    key: "basic-obedience",
    title: "Basic Obedience",
    emoji: "🎓",
    difficulty: "Beginner",
    summary:
      "The core cues every dog needs: sit, down, stay, come, leave-it, and a reliable release. Lure-then-fade with positive reinforcement.",
    sessions: [
      {
        key: "sit",
        title: "Sit",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "A reliable sit on a single verbal cue.",
        steps: [
          "Hold a treat at your dog's nose, slowly raise it back over their head.",
          "As the head goes up, the rear goes down — mark and reward the sit.",
          "After a few lures, try the hand motion with no treat, then reward.",
          "Add the word 'sit' just before the hand motion; fade the lure.",
        ],
        tips: ["If they back up instead, practice with their rear near a wall."],
      },
      {
        key: "down",
        title: "Down",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "A calm down from sit or stand.",
        steps: [
          "From a sit, move a treat from the nose straight down to the floor.",
          "Slide it slightly forward so they follow into a down; mark and reward.",
          "Repeat, then add the cue 'down' as they begin to lie down.",
          "Reward generously on the floor to build duration.",
        ],
        tips: ["On slick floors, use a rug — comfort makes downs faster."],
      },
      {
        key: "stay",
        title: "Stay (duration)",
        durationMin: 8,
        difficulty: "Intermediate",
        objective: "Hold position until released, building the 3 Ds: duration, distance, distraction.",
        steps: [
          "Ask for a sit; say 'stay' with a flat-hand signal.",
          "Wait 1 second, mark, reward, then release with 'okay'.",
          "Increase time first, THEN take a step back, THEN add distractions.",
          "If they break, calmly reset and make the last step easier.",
        ],
        tips: ["Reward IN position, release with a separate word — don't confuse them."],
      },
      {
        key: "recall-intro",
        title: "Come (foundation)",
        durationMin: 8,
        difficulty: "Beginner",
        objective: "Build a happy, fast response to 'come' indoors.",
        steps: [
          "Back away a few steps and call 'come!' in a happy voice.",
          "Reward lavishly when they reach you — party every time.",
          "Practice short distances first, then between two people.",
          "Never call 'come' for something unpleasant (baths, nail trims).",
        ],
        tips: ["Make coming to you the best thing that happens all day."],
      },
      {
        key: "leave-it",
        title: "Leave it",
        durationMin: 7,
        difficulty: "Intermediate",
        objective: "Disengage from something on cue — a safety essential.",
        steps: [
          "Place a treat in a closed fist; let them sniff and lick.",
          "Wait; the instant they pull back, mark and reward from the OTHER hand.",
          "Add the cue 'leave it'; progress to a treat on the floor, covered.",
          "Build to walking past food on the ground.",
        ],
        tips: ["Always reward from a different source than the forbidden item."],
      },
      {
        key: "release-word",
        title: "Release word & default sit",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "A clear 'you're free' word and a polite default sit.",
        steps: [
          "Pick a release word ('okay', 'free') and use it after every stay.",
          "Reward your dog for offering a sit when they want something.",
          "Use the default sit before meals, doors, and greetings.",
          "Keep the release word consistent across the household.",
        ],
        tips: ["A default sit replaces jumping and pushy behavior."],
      },
    ],
  },
  {
    key: "leash-manners",
    title: "Leash Manners",
    emoji: "🦮",
    difficulty: "Intermediate",
    summary:
      "Loose-leash walking without pulling: attention, the 'be a tree' method, turns, and passing distractions calmly.",
    sessions: [
      {
        key: "engagement",
        title: "Attention & engagement",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Reward your dog for checking in with you on leash.",
        steps: [
          "Stand still with the leash; mark and reward any glance at you.",
          "Take one step; reward attention. Build to a few steps.",
          "Use a 'watch me' cue with a treat at your eyes.",
          "Practice in the quiet of your home before heading outside.",
        ],
        tips: ["Reward at your pant seam to encourage walking by your side."],
      },
      {
        key: "be-a-tree",
        title: "The 'be a tree' method",
        durationMin: 8,
        difficulty: "Intermediate",
        objective: "Teach that pulling stops forward progress.",
        steps: [
          "Walk forward; the moment the leash goes tight, stop and stand still.",
          "Wait for slack (a step back or a check-in), then mark and move on.",
          "Reward heavily whenever the leash is loose.",
          "Be patient and consistent — every stop teaches the lesson.",
        ],
        tips: ["A front-clip harness reduces pulling while you train."],
      },
      {
        key: "turns",
        title: "Direction changes",
        durationMin: 7,
        difficulty: "Intermediate",
        objective: "Keep your dog attentive by changing direction.",
        steps: [
          "Walk a few steps, then turn the opposite way with a cheerful cue.",
          "Reward your dog for catching up to your side.",
          "Mix left, right, and about-turns unpredictably.",
          "Keep it like a game, not a correction.",
        ],
        tips: ["Smooth, predictable rewards keep them choosing to stay close."],
      },
      {
        key: "passing-distractions",
        title: "Passing dogs & people",
        durationMin: 10,
        difficulty: "Advanced",
        objective: "Walk calmly past triggers using distance and rewards.",
        steps: [
          "Start far enough that your dog notices but can still focus.",
          "Reward attention as you pass at a distance.",
          "Gradually decrease distance over many sessions.",
          "If they fixate or pull, add distance — don't force closeness.",
        ],
        tips: ["Calm passing is built over weeks, not in one walk."],
      },
      {
        key: "auto-check-in",
        title: "Automatic check-ins",
        durationMin: 6,
        difficulty: "Intermediate",
        objective: "Your dog voluntarily looks at you during walks.",
        steps: [
          "Reward unprompted glances during the walk.",
          "Stop cueing 'watch me' and let them offer it.",
          "Vary the reward timing so they keep checking.",
          "Phase to praise + occasional treats.",
        ],
        tips: ["Surprise rewards keep attention strong long-term."],
      },
    ],
  },
  {
    key: "reliable-recall",
    title: "Reliable Recall",
    emoji: "🎯",
    difficulty: "Intermediate",
    summary:
      "A rock-solid 'come' you can trust — building from indoors to long-line work outdoors, with games that make recall irresistible.",
    sessions: [
      {
        key: "recall-game",
        title: "The recall party game",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Charge up the recall cue with high value.",
        steps: [
          "Say 'come!' and run backwards a few steps.",
          "When your dog catches you, throw a treat party and play.",
          "Keep every recall a celebration.",
          "End while they still want more.",
        ],
        tips: ["Use your dog's favorite reward — recall earns the best stuff."],
      },
      {
        key: "ping-pong",
        title: "Two-person ping-pong recall",
        durationMin: 8,
        difficulty: "Beginner",
        objective: "Build speed and reliability with a partner.",
        steps: [
          "Two people sit a short distance apart.",
          "Take turns calling the dog; reward each arrival.",
          "Gradually increase the distance between you.",
          "Add the dog's name before 'come' for focus.",
        ],
        tips: ["Keep it fast and fun — speed comes from excitement."],
      },
      {
        key: "long-line",
        title: "Long-line outdoor recall",
        durationMin: 12,
        difficulty: "Intermediate",
        objective: "Practice recall safely in open spaces.",
        steps: [
          "Attach a 5–10m long line to a harness in a safe area.",
          "Let your dog explore, then call 'come' and reward big.",
          "Use the line only to prevent escapes, never to reel them in.",
          "Build up to mild distractions like a quiet park.",
        ],
        tips: ["A long line gives freedom while keeping safety."],
      },
      {
        key: "proofing-distractions",
        title: "Proofing against distractions",
        durationMin: 12,
        difficulty: "Advanced",
        objective: "Recall even when something interesting is happening.",
        steps: [
          "Practice recall near mild distractions (a sniff spot, a person).",
          "Reward extra well for hard recalls.",
          "If they don't come, decrease the distraction next time.",
          "Never punish a slow recall — it poisons the cue.",
        ],
        tips: ["Jackpot the hardest recalls with several treats in a row."],
      },
      {
        key: "emergency-recall",
        title: "Emergency recall word",
        durationMin: 8,
        difficulty: "Intermediate",
        objective: "A special word reserved for true emergencies.",
        steps: [
          "Choose a unique word you never use casually.",
          "Pair it with an amazing reward (steak, chicken) — no command needed.",
          "Repeat the pairing until the word alone brings instant joy.",
          "Test rarely and always reward enormously.",
        ],
        tips: ["Protect this word — only use it when it truly matters."],
      },
    ],
  },
  {
    key: "impulse-control",
    title: "Impulse Control",
    emoji: "🧘",
    difficulty: "Intermediate",
    summary:
      "Self-control skills: wait at doors, leave food alone, settle on cue, and a polite greeting instead of jumping.",
    sessions: [
      {
        key: "wait-at-door",
        title: "Wait at doors",
        durationMin: 7,
        difficulty: "Intermediate",
        objective: "No bolting through open doors.",
        steps: [
          "Reach for the door; if your dog surges, your hand comes off the handle.",
          "Open a crack only while they hold position.",
          "Reward calm waiting, then release to go through.",
          "Build to a fully open door with a solid wait.",
        ],
        tips: ["Safety skill — practice at every door, every time."],
      },
      {
        key: "food-manners",
        title: "Food-bowl manners",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Sit politely while the bowl is placed down.",
        steps: [
          "Ask for a sit; begin lowering the bowl.",
          "If they break, the bowl goes back up.",
          "Bowl reaches the floor only while they hold the sit.",
          "Release with 'okay' to eat.",
        ],
        tips: ["Calm before meals carries over to calm elsewhere."],
      },
      {
        key: "its-yer-choice",
        title: "Leave-it impulse game",
        durationMin: 6,
        difficulty: "Intermediate",
        objective: "Choosing to ignore food earns the reward.",
        steps: [
          "Offer a treat in an open palm; close it if they dive in.",
          "Open again; reward the moment they hesitate or look away.",
          "Build to treats on the floor you can cover quickly.",
          "Add the 'leave it' cue once they reliably wait.",
        ],
        tips: ["The dog learns self-control pays better than grabbing."],
      },
      {
        key: "polite-greeting",
        title: "Polite greetings (no jumping)",
        durationMin: 8,
        difficulty: "Intermediate",
        objective: "Four-on-the-floor greetings instead of jumping.",
        steps: [
          "Approach calmly; if your dog jumps, turn away and ignore.",
          "Reward all four paws on the floor with attention.",
          "Ask for a sit to greet; reward heavily.",
          "Coach visitors to only greet a sitting dog.",
        ],
        tips: ["Consistency from everyone is the secret to no-jumping."],
      },
      {
        key: "relax-on-cue",
        title: "Relax on cue",
        durationMin: 8,
        difficulty: "Intermediate",
        objective: "Switch from excited to calm with a settle cue.",
        steps: [
          "After light play, cue 'settle' on a mat.",
          "Reward slow breathing and a relaxed body, treats low and slow.",
          "Gradually extend the calm time.",
          "Use before guests arrive or in busy settings.",
        ],
        tips: ["Capturing calm is as important as training cues."],
      },
    ],
  },
  {
    key: "socialization",
    title: "Socialization & Confidence",
    emoji: "🌍",
    difficulty: "Beginner",
    summary:
      "Positive exposure to the world — sounds, surfaces, people, and other dogs — at the dog's pace, to build a confident, resilient companion.",
    sessions: [
      {
        key: "novel-sounds",
        title: "Novel sounds",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Build comfort with everyday noises.",
        steps: [
          "Play recordings (traffic, vacuum, thunder) at a low volume.",
          "Pair each sound with treats and calm praise.",
          "Slowly raise the volume across sessions.",
          "Watch body language; back off if worried.",
        ],
        tips: ["Counter-conditioning turns scary sounds into treat predictors."],
      },
      {
        key: "surfaces",
        title: "New surfaces & objects",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Confidence walking on different textures.",
        steps: [
          "Lay out surfaces: a towel, plastic, grates, wobble board.",
          "Reward any sniff or step toward them.",
          "Let your dog choose to explore — never drag.",
          "Build to walking fully across each.",
        ],
        tips: ["Confident paws help with vet scales, stairs, and grooming tables."],
      },
      {
        key: "meeting-people",
        title: "Meeting new people",
        durationMin: 8,
        difficulty: "Beginner",
        objective: "Calm, friendly greetings with strangers.",
        steps: [
          "Let people toss treats rather than reaching over the head.",
          "Allow your dog to approach in their own time.",
          "Reward calm, curious behavior.",
          "Keep first meetings short and positive.",
        ],
        tips: ["Choice reduces fear — never force an interaction."],
      },
      {
        key: "dog-introductions",
        title: "Polite dog introductions",
        durationMin: 10,
        difficulty: "Intermediate",
        objective: "Calm greetings with other dogs.",
        steps: [
          "Start with a parallel walk at a distance.",
          "Reward calm attention and loose body language.",
          "Allow a brief sniff, then move on — keep it short.",
          "Avoid head-on, on-leash face-offs.",
        ],
        tips: ["Good greetings are brief; long stares can escalate."],
      },
      {
        key: "handling-confidence",
        title: "Vet & grooming confidence",
        durationMin: 7,
        difficulty: "Beginner",
        objective: "Cooperative-care basics for stress-free handling.",
        steps: [
          "Practice paw holds, ear checks, and a 'chin rest' on your hand.",
          "Reward stillness; let your dog opt in.",
          "Mimic vet motions (gentle restraint) paired with treats.",
          "Introduce a brush, nail file, and toothbrush gradually.",
        ],
        tips: ["A chin rest gives your dog a way to say 'I'm ready'."],
      },
    ],
  },
  {
    key: "tricks",
    title: "Fun Tricks",
    emoji: "✨",
    difficulty: "Beginner",
    summary:
      "Bonding games and impressive tricks — shake, spin, roll over, touch, and 'go to bed' — that build focus while having fun.",
    sessions: [
      {
        key: "shake",
        title: "Shake / paw",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "Offer a paw on cue.",
        steps: [
          "With your dog in a sit, hold a treat near a paw.",
          "Mark and reward any paw lift.",
          "Add the cue 'shake' as the paw rises.",
          "Build to placing the paw in your open hand.",
        ],
        tips: ["Most dogs are naturally pawsy — capture it!"],
      },
      {
        key: "spin",
        title: "Spin",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "A full circle following a lure.",
        steps: [
          "Lure your dog's nose in a circle with a treat.",
          "Mark and reward the full turn.",
          "Add the cue 'spin', then shrink the hand motion.",
          "Try the other direction with a different word.",
        ],
        tips: ["Keep the lure slow so they don't lose the scent."],
      },
      {
        key: "touch",
        title: "Touch (hand target)",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "Boop your hand with their nose — a versatile cue.",
        steps: [
          "Present a flat hand near your dog's nose.",
          "Mark and reward any nose touch.",
          "Add the cue 'touch'; move your hand to new positions.",
          "Use touch to guide movement and build confidence.",
        ],
        tips: ["Hand targeting helps with recall, positioning, and shy dogs."],
      },
      {
        key: "roll-over",
        title: "Roll over",
        durationMin: 7,
        difficulty: "Intermediate",
        objective: "A full roll from a down.",
        steps: [
          "From a down, lure the nose toward the shoulder.",
          "Continue the lure so they roll onto their side, then over.",
          "Mark and reward the full roll.",
          "Add the cue and fade the lure gradually.",
        ],
        tips: ["Use a soft surface so rolling is comfortable."],
      },
      {
        key: "go-to-bed",
        title: "Go to bed",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Send your dog to a bed or mat from a distance.",
        steps: [
          "Reward your dog for going to their bed.",
          "Add the cue 'go to bed' as they step on.",
          "Increase the distance you send them from.",
          "Reward a settled down on the bed.",
        ],
        tips: ["Great for mealtimes, doorbells, and guests."],
      },
    ],
  },
  {
    key: "senior-enrichment",
    title: "Senior Dog Enrichment",
    emoji: "🌟",
    difficulty: "Beginner",
    summary:
      "Gentle mental and physical enrichment for older dogs — sniff games, easy nose work, soft stretches, and refreshers that keep aging minds sharp.",
    sessions: [
      {
        key: "snuffle-search",
        title: "Snuffle & scatter feeding",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Low-impact mental work through scent.",
        steps: [
          "Scatter kibble in grass or a snuffle mat.",
          "Encourage your dog to sniff and find each piece.",
          "Keep it easy and rewarding.",
          "Use part of a meal so it isn't extra calories.",
        ],
        tips: ["Sniffing is calming and tires the brain gently."],
      },
      {
        key: "find-it",
        title: "Find-it nose work",
        durationMin: 7,
        difficulty: "Beginner",
        objective: "A simple search game for confidence and focus.",
        steps: [
          "Show a treat, then hide it nearby in easy view.",
          "Cue 'find it' and reward the discovery.",
          "Gradually make hides slightly harder.",
          "Keep sessions short to avoid fatigue.",
        ],
        tips: ["Nose work suits dogs with limited mobility or vision."],
      },
      {
        key: "gentle-stretches",
        title: "Gentle movement & stretches",
        durationMin: 6,
        difficulty: "Beginner",
        objective: "Maintain mobility with easy, vet-safe movement.",
        steps: [
          "Lure slow figure-eights between your legs at a walk.",
          "Encourage gentle sit-to-stand reps for strength.",
          "Keep everything slow and reward calm effort.",
          "Stop at any sign of discomfort.",
        ],
        tips: ["Check with your vet before new exercise for senior dogs."],
      },
      {
        key: "cue-refreshers",
        title: "Cue refreshers",
        durationMin: 5,
        difficulty: "Beginner",
        objective: "Keep familiar cues sharp and rewarding.",
        steps: [
          "Run through known cues (sit, touch, settle) at an easy pace.",
          "Reward generously — success keeps senior minds engaged.",
          "Mix in a favorite trick for fun.",
          "End every session on a win.",
        ],
        tips: ["Short, frequent sessions beat long ones for older dogs."],
      },
    ],
  },
];

// Flatten helpers used by the UI + progress math.
export function getProgram(programKey) {
  return TRAINING_PROGRAMS.find((p) => p.key === programKey) || null;
}

export function totalSessions(programKey) {
  const p = getProgram(programKey);
  return p ? p.sessions.length : 0;
}

// Build a Set of "programKey/sessionKey" completion ids from progress rows.
export function completionId(programKey, sessionKey) {
  return `${programKey}/${sessionKey}`;
}

// Given the API's completed rows, count how many sessions of a program are done.
export function programDoneCount(programKey, completedSet) {
  const p = getProgram(programKey);
  if (!p) return 0;
  return p.sessions.filter((s) => completedSet.has(completionId(programKey, s.key)))
    .length;
}
