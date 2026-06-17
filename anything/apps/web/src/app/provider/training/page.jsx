import ProviderShell from "../components/ProviderShell";
import ProviderTraining from "../components/ProviderTraining";

// /provider/training — the Training workspace (ticket 2.10). The shell resolves auth + the
// active provider context and hands the resolved providerId to the screen via a render-prop,
// so the workspace never renders without a valid provider. This is the PROVIDER training
// SERVICE (managing classes/programs + logging progress) — DISTINCT from the consumer
// self-Training tab in the mobile app.
export default function ProviderTrainingPage() {
  return (
    <ProviderShell active="training">
      {(providerId) => <ProviderTraining providerId={providerId} />}
    </ProviderShell>
  );
}
