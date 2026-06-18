import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronUp, ChevronDown } from "lucide-react-native";

const C = {
  coral: "#FF6F61",
  sage: "#5A8A74",
  mutedBrown: "#7A6254",
  warmBrown: "#3B241B",
};

/**
 * VoteControl — up/down arrows + score for a forum thread or comment (ticket 2.44).
 * Tapping the active direction again clears the vote (value 0). `horizontal` lays the
 * arrows side-by-side (comments); default is a vertical stack (thread cards).
 */
export default function VoteControl({
  score = 0,
  myVote = null,
  onVote,
  horizontal = false,
  testIDPrefix = "vote",
}) {
  const cast = (dir) => onVote(myVote === dir ? 0 : dir);

  return (
    <View
      style={{
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        gap: horizontal ? 8 : 2,
      }}
    >
      <TouchableOpacity
        testID={`${testIDPrefix}-up`}
        onPress={() => cast(1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronUp size={20} color={myVote === 1 ? C.coral : C.mutedBrown} />
      </TouchableOpacity>
      <Text
        testID={`${testIDPrefix}-score`}
        style={{
          fontSize: 13,
          fontWeight: "800",
          color:
            myVote === 1 ? C.coral : myVote === -1 ? C.sage : C.warmBrown,
          minWidth: 18,
          textAlign: "center",
        }}
      >
        {score}
      </Text>
      <TouchableOpacity
        testID={`${testIDPrefix}-down`}
        onPress={() => cast(-1)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronDown size={20} color={myVote === -1 ? C.sage : C.mutedBrown} />
      </TouchableOpacity>
    </View>
  );
}
