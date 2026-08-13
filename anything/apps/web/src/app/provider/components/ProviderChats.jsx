import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { MessageSquare, Send, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderThreads,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Provider dashboard "Chats" section (Phase 2 ticket 2.5) — replaces the old
// coming-soon stub. A two-pane view: the thread list (owners who messaged this
// provider) + the open conversation. Real data only; empty states, never mock.
//
// REALTIME: the hooks POLL (threads 15s, messages 8s) — the documented lightweight
// choice over a Supabase Realtime websocket. Sufficient for an owner↔provider channel.

function formatTime(ts) {
  if (!ts) return "";
  const then = new Date(ts);
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  return sameDay
    ? then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : then.toLocaleDateString();
}

function ThreadRow({ thread, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 border-b border-[#FFF7EF] px-4 py-3 text-left transition-colors hover:bg-[#FFFBF6]"
      style={active ? { backgroundColor: "#FFF1E2" } : undefined}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ backgroundColor: COLORS.peach, color: COLORS.terracotta }}
      >
        {(thread.owner_name || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-[#3B241B]">
            {thread.owner_name || "Pet owner"}
          </span>
          <span className="flex-shrink-0 text-[11px] text-[#B8A99D]">
            {formatTime(thread.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-[#7A6254]">
            {thread.last_message_body ||
              (thread.last_message_attachment_url ? "Photo" : "No messages yet")}
          </span>
          {thread.unread_count > 0 && (
            <span
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: COLORS.coral }}
            >
              {thread.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Conversation({ providerId, thread }) {
  const { data: messages, isLoading } = useThreadMessages(thread.id);
  const { mutate: send, isPending } = useSendMessage(providerId, thread.id);
  const { mutate: markRead } = useMarkThreadRead(providerId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  // Mark read when the conversation opens / new messages land with this thread open.
  useEffect(() => {
    if (thread?.id) markRead(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, messages?.length]);

  // Keep the latest message in view (messages come newest-first; we render oldest-first).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const ordered = (messages ?? []).slice().reverse();

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    send(
      { body: text },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => toast.error(err?.message || "Failed to send"),
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#FFD9B3] px-5 py-4">
        <p className="text-base font-bold text-[#3B241B]">
          {thread.owner_name || "Pet owner"}
        </p>
        {thread.booking_id && (
          <p className="text-xs text-[#7A6254]">
            About booking #{thread.booking_id}
          </p>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[#7A6254]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
            Loading messages…
          </div>
        ) : ordered.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#7A6254]">
            No messages yet. Say hello.
          </p>
        ) : (
          ordered.map((m) => {
            const fromProvider = String(m.sender_user_id) !== String(thread.owner_user_id);
            return (
              <div
                key={m.id}
                className={`flex ${fromProvider ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[70%] rounded-2xl px-3.5 py-2 text-sm"
                  style={
                    fromProvider
                      ? { backgroundColor: COLORS.coral, color: "#fff" }
                      : { backgroundColor: "#FFF1E2", color: "#3B241B" }
                  }
                >
                  {m.attachment_url && (
                    <img
                      src={m.attachment_url}
                      alt="attachment"
                      className="mb-1 max-h-48 rounded-lg"
                    />
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: fromProvider ? "rgba(255,255,255,0.8)" : "#B8A99D" }}
                  >
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[#FFD9B3] px-4 py-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Type a message…"
          aria-label="Message"
          className="flex-1 rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-sm text-[#3B241B] outline-none focus:border-[#FF6F61]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={isPending || !draft.trim()}
          aria-label="Send"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.coral }}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function ProviderChats({ providerId }) {
  const { data: threads, isLoading, isError, error } = useProviderThreads(providerId);
  // Deep-link (ticket A4): /provider/chats?thread=<id> pre-selects that conversation — the hand-off
  // target for the adoption "Message" button. We seed activeId from the param and re-apply it when it
  // changes; if the thread isn't in the inbox yet, activeId still holds so the conversation opens as
  // soon as the polling list includes it. With no param, first-load behavior is unchanged.
  const [searchParams] = useSearchParams();
  const threadParam = searchParams.get("thread");
  const [activeId, setActiveId] = useState(threadParam ?? null);

  useEffect(() => {
    if (threadParam != null && threadParam !== "") setActiveId(threadParam);
  }, [threadParam]);

  const list = threads ?? [];
  const active = list.find((t) => String(t.id) === String(activeId)) || null;

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <MessageSquare className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Chats</h1>
          <p className="text-sm text-[#7A6254]">
            Messages from pet owners
          </p>
        </div>
      </div>

      <div className="flex h-[70vh] overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {/* Thread list */}
        <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-[#FFD9B3]">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-[#7A6254]">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
              Loading…
            </div>
          ) : isError ? (
            <div className="px-4 py-16 text-center">
              <p className="font-semibold text-[#B23B30]">Couldn't load chats</p>
              <p className="mt-1 text-sm text-[#7A6254]">
                {error?.message || "Please try again."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-base font-semibold text-[#3B241B]">No chats yet</p>
              <p className="mt-1 text-sm text-[#7A6254]">
                When a pet owner messages you, it appears here.
              </p>
            </div>
          ) : (
            list.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={String(t.id) === String(activeId)}
                onClick={() => setActiveId(t.id)}
              />
            ))
          )}
        </div>

        {/* Conversation */}
        <div className="flex-1">
          {active ? (
            <Conversation providerId={providerId} thread={active} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[#7A6254]">
              <ImageIcon className="h-8 w-8" style={{ color: COLORS.peach }} />
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
