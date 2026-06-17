import ProviderShell from "../components/ProviderShell";
import ProviderChats from "../components/ProviderChats";

// /provider/chats — owner ↔ provider messaging (Phase 2 ticket 2.5). The shell
// resolves auth + the active provider context and hands the resolved providerId to
// the Chats screen via a render-prop, so it never renders without a valid provider.
export default function ProviderChatsPage() {
  return (
    <ProviderShell active="chats">
      {(providerId) => <ProviderChats providerId={providerId} />}
    </ProviderShell>
  );
}
