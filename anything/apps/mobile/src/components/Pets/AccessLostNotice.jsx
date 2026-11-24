import { useEffect } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import usePetAccessStore from "@/store/petAccessStore";

// Tells the person, ONCE and kindly, that a dog shared with them is no longer theirs to see (the owner removed them, they left, or the access
// expired). Mounted once in the root layout. utils/petAccess.handleAccessLost queues the notice; the caches are already cleared and the
// selection already moved to another dog by then, so the alert is purely informational. Renders nothing.
export function AccessLostNotice() {
  const { t } = useTranslation();
  const notice = usePetAccessStore((s) => s.lostNotice);
  const setLostNotice = usePetAccessStore((s) => s.setLostNotice);

  useEffect(() => {
    if (!notice) return;
    // Clear first: the alert must never fire twice for the same loss.
    setLostNotice(null);
    Alert.alert(
      t("sharedDog.accessLostTitle"),
      notice.petName
        ? t("sharedDog.accessLostBody", { name: notice.petName })
        : t("sharedDog.accessLostBodyUnnamed"),
    );
  }, [notice, setLostNotice, t]);

  return null;
}

export default AccessLostNotice;
