// Social walk notification generators
export const SOCIAL_WALK_NOTIFICATION_TYPES = {
  FRIEND_WALK_INVITE: "friend_walk_invite",
  JOIN_REQUEST_RECEIVED: "join_request_received",
  JOIN_REQUEST_APPROVED: "join_request_approved",
  JOIN_REQUEST_DECLINED: "join_request_declined",
  WALK_STARTING_SOON: "walk_starting_soon",
};

export function createFriendWalkInviteNotification(socialWalk, hostPet) {
  return {
    id: `social_walk_invite_${socialWalk.id}`,
    type: SOCIAL_WALK_NOTIFICATION_TYPES.FRIEND_WALK_INVITE,
    title: `${hostPet.name} invited you for a walk`,
    message: `${socialWalk.walk_name} today at ${formatWalkTime(socialWalk.scheduled_at)} · ${formatPace(socialWalk.pace)} pace`,
    timestamp: new Date().toISOString(),
    read: false,
    actionable: true,
    actions: [
      {
        label: "Join request",
        type: "join",
        socialWalkId: socialWalk.id,
      },
      {
        label: "Maybe later",
        type: "dismiss",
      },
    ],
    data: {
      socialWalkId: socialWalk.id,
      hostPetId: socialWalk.pet_id,
      hostOwnerId: socialWalk.owner_user_id,
    },
  };
}

export function createJoinRequestReceivedNotification(
  joinRequest,
  requesterPet,
) {
  return {
    id: `join_request_${joinRequest.id}`,
    type: SOCIAL_WALK_NOTIFICATION_TYPES.JOIN_REQUEST_RECEIVED,
    title: "New walk request",
    message: `${requesterPet.name} wants to join your walk.`,
    timestamp: new Date().toISOString(),
    read: false,
    actionable: true,
    actions: [
      {
        label: "Approve",
        type: "approve",
        joinRequestId: joinRequest.id,
        socialWalkId: joinRequest.social_walk_id,
      },
      {
        label: "Decline",
        type: "decline",
        joinRequestId: joinRequest.id,
        socialWalkId: joinRequest.social_walk_id,
      },
    ],
    data: {
      joinRequestId: joinRequest.id,
      socialWalkId: joinRequest.social_walk_id,
      requesterPetId: joinRequest.requester_pet_id,
      requesterUserId: joinRequest.requester_user_id,
    },
  };
}

export function createJoinRequestApprovedNotification(socialWalk, hostPet) {
  return {
    id: `join_approved_${socialWalk.id}`,
    type: SOCIAL_WALK_NOTIFICATION_TYPES.JOIN_REQUEST_APPROVED,
    title: "Walk request approved!",
    message: `You're joining ${hostPet.name} for ${socialWalk.walk_name}`,
    timestamp: new Date().toISOString(),
    read: false,
    actionable: true,
    actions: [
      {
        label: "View details",
        type: "view_walk",
        socialWalkId: socialWalk.id,
      },
    ],
    data: {
      socialWalkId: socialWalk.id,
      hostPetId: socialWalk.pet_id,
      meetingLocationDetails: socialWalk.meeting_location_details,
      scheduledAt: socialWalk.scheduled_at,
    },
  };
}

export function createJoinRequestDeclinedNotification(socialWalk, hostPet) {
  return {
    id: `join_declined_${socialWalk.id}_${Date.now()}`,
    type: SOCIAL_WALK_NOTIFICATION_TYPES.JOIN_REQUEST_DECLINED,
    title: "Walk request not accepted",
    message: `${hostPet.name}'s walk is full or no longer available`,
    timestamp: new Date().toISOString(),
    read: false,
    actionable: false,
    data: {
      socialWalkId: socialWalk.id,
    },
  };
}

export function createWalkStartingSoonNotification(socialWalk, participants) {
  const participantNames = participants.map((p) => p.pet_name).join(", ");
  return {
    id: `walk_starting_${socialWalk.id}`,
    type: SOCIAL_WALK_NOTIFICATION_TYPES.WALK_STARTING_SOON,
    title: "Walk starting soon!",
    message: `${socialWalk.walk_name} with ${participantNames} starts in 15 minutes`,
    timestamp: new Date().toISOString(),
    read: false,
    actionable: true,
    actions: [
      {
        label: "View details",
        type: "view_walk",
        socialWalkId: socialWalk.id,
      },
    ],
    data: {
      socialWalkId: socialWalk.id,
      scheduledAt: socialWalk.scheduled_at,
      meetingLocationDetails: socialWalk.meeting_location_details,
    },
  };
}

// Helper functions
function formatWalkTime(isoString) {
  const date = new Date(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

function formatPace(pace) {
  if (!pace) return "Normal";
  return pace.charAt(0).toUpperCase() + pace.slice(1);
}
