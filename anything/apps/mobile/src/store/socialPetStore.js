import { create } from "zustand";

// ─────────────────────────────────────────────
// CENTRAL SOCIAL PET STATE STORE
// ─────────────────────────────────────────────

const useSocialPetStore = create((set, get) => ({
  // ── Current User ──
  currentUser: {
    id: "user1",
    name: "You",
    avatar: "https://i.pravatar.cc/150?img=3",
  },

  // ── Current Pet ──
  currentPet: null,
  setCurrentPet: (pet) => set({ currentPet: pet }),

  // ── Has Posted Today ──
  hasPostedToday: false,
  setHasPostedToday: (status) => set({ hasPostedToday: status }),
  todayPostId: null,

  // ── Posts ──
  posts: [],
  setPosts: (posts) => set({ posts }),

  addPost: (post) => {
    const newPost = {
      ...post,
      id: post.id || Date.now().toString(),
      timestamp: post.timestamp || "Just now",
      paws: post.paws || 0,
      barks: post.barks || 0,
      comments: post.comments || [],
      isDailyUpdate: post.isDailyUpdate || false,
    };
    set((state) => ({
      posts: [newPost, ...state.posts],
      hasPostedToday: newPost.isDailyUpdate ? true : state.hasPostedToday,
      todayPostId: newPost.isDailyUpdate ? newPost.id : state.todayPostId,
    }));
    return newPost;
  },

  updatePost: (postId, updates) => {
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, ...updates } : p,
      ),
    }));
  },

  // ── Comments (Barks) ──
  addComment: (postId, comment) => {
    const newComment = {
      ...comment,
      id: comment.id || Date.now().toString(),
      time: comment.time || "Just now",
    };
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [...(p.comments || []), newComment],
              barks: (p.barks || 0) + 1,
            }
          : p,
      ),
    }));
  },

  getPostComments: (postId) => {
    const post = get().posts.find((p) => p.id === postId);
    return post?.comments || [];
  },

  // ── Likes (Paws) ──
  likedPosts: {},
  toggleLike: (postId) => {
    const { likedPosts, posts } = get();
    const isLiked = !!likedPosts[postId];
    set({
      likedPosts: { ...likedPosts, [postId]: !isLiked },
      posts: posts.map((p) =>
        p.id === postId ? { ...p, paws: isLiked ? p.paws - 1 : p.paws + 1 } : p,
      ),
    });
  },

  // ── Notifications ──
  notifications: [],
  unreadNotificationCount: 0,

  addNotification: (notification) => {
    const newNotif = {
      ...notification,
      id: notification.id || Date.now().toString(),
      timestamp: notification.timestamp || new Date().toISOString(),
      read: notification.read || false,
    };
    set((state) => ({
      notifications: [newNotif, ...state.notifications],
      unreadNotificationCount: state.unreadNotificationCount + 1,
    }));
  },

  markNotificationRead: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
      unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1),
    }));
  },

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadNotificationCount: 0,
    }));
  },

  // ── Conversations ──
  conversations: [],

  addConversation: (conversation) => {
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    }));
  },

  updateConversation: (conversationId, updates) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, ...updates } : c,
      ),
    }));
  },

  // ── Messages ──
  messages: {},

  addMessage: (conversationId, message) => {
    const newMessage = {
      ...message,
      id: message.id || Date.now().toString(),
      timestamp: message.timestamp || new Date().toISOString(),
      read: message.read || false,
    };
    set((state) => {
      const conversationMessages = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...conversationMessages, newMessage],
        },
      };
    });
    // Update conversation last message
    get().updateConversation(conversationId, {
      lastMessage: newMessage.text || "Sent a photo",
      lastMessageTime: newMessage.timestamp,
      unread: newMessage.senderId !== get().currentUser.id,
    });
  },

  getConversationMessages: (conversationId) => {
    return get().messages[conversationId] || [];
  },

  markConversationRead: (conversationId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((m) => ({
          ...m,
          read: true,
        })),
      },
    }));
    get().updateConversation(conversationId, { unread: false });
  },

  // ── Popular Profiles (for discovery) ──
  popularProfiles: [],
  setPopularProfiles: (profiles) => set({ popularProfiles: profiles }),

  // ── Popular Pet Moments (for discovery) ──
  popularPetMoments: [],
  setPopularPetMoments: (moments) => set({ popularPetMoments: moments }),
}));

export default useSocialPetStore;
