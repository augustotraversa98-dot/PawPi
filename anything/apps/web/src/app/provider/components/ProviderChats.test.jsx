import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ProviderChats — the dashboard Chats section (ticket 2.5). Hooks are mocked so this
// isolates rendering: the empty state, the thread list, opening a conversation, and
// sending a message. No DB / react-query / participant RLS here (that's the harness).

vi.mock("../hooks/useProviders", () => ({
  useProviderThreads: vi.fn(),
  useThreadMessages: vi.fn(),
  useSendMessage: vi.fn(),
  useMarkThreadRead: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useProviderThreads,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
} from "../hooks/useProviders";
import ProviderChats from "./ProviderChats";

const THREAD = {
  id: 100,
  owner_user_id: 7,
  provider_id: 10,
  booking_id: null,
  last_message_at: "2026-06-16T10:00:00Z",
  owner_name: "Sam Owner",
  last_message_body: "Hi there",
  unread_count: 2,
};

const sendMock = vi.fn();
const markReadMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useSendMessage.mockReturnValue({ mutate: sendMock, isPending: false });
  useMarkThreadRead.mockReturnValue({ mutate: markReadMock });
  useThreadMessages.mockReturnValue({ data: [], isLoading: false });
});

describe("ProviderChats", () => {
  it("shows the empty state when there are no threads", () => {
    useProviderThreads.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ProviderChats providerId={10} />);
    expect(screen.getByText("No chats yet")).toBeInTheDocument();
  });

  it("lists threads with the owner name and unread badge", () => {
    useProviderThreads.mockReturnValue({ data: [THREAD], isLoading: false, isError: false });
    render(<ProviderChats providerId={10} />);
    expect(screen.getByText("Sam Owner")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // unread badge
    // Conversation not open yet.
    expect(
      screen.getByText("Select a conversation to start chatting"),
    ).toBeInTheDocument();
  });

  it("opens a conversation and marks it read", () => {
    useProviderThreads.mockReturnValue({ data: [THREAD], isLoading: false, isError: false });
    useThreadMessages.mockReturnValue({
      data: [
        { id: 1, sender_user_id: 7, body: "Hi there", created_at: "2026-06-16T10:00:00Z" },
        { id: 2, sender_user_id: 99, body: "Hello back", created_at: "2026-06-16T10:01:00Z" },
      ],
      isLoading: false,
    });
    render(<ProviderChats providerId={10} />);
    fireEvent.click(screen.getByText("Sam Owner"));
    expect(markReadMock).toHaveBeenCalledWith(100);
    expect(screen.getByText("Hello back")).toBeInTheDocument();
  });

  it("sends a typed message", () => {
    useProviderThreads.mockReturnValue({ data: [THREAD], isLoading: false, isError: false });
    render(<ProviderChats providerId={10} />);
    fireEvent.click(screen.getByText("Sam Owner"));
    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "On my way" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(sendMock).toHaveBeenCalledWith(
      { body: "On my way" },
      expect.any(Object),
    );
  });
});
