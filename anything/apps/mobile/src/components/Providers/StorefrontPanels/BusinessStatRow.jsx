import React from "react";
import { useTranslation } from "react-i18next";
import { SocialStatRow } from "@/components/social/SocialStatRow";
import { useProviderFollow } from "@/hooks/useProviders";
import { COLORS } from "@/constants/colors";

// Business storefront stat row (ticket 2.93) — the same strip the pet social profile uses,
// with the four business stats: Posts · Paws · Barks · Followers ("Following" is omitted — a
// business doesn't follow). Posts/Paws/Barks come from the public profile payload's `stats`
// (real counts; Paws stays 0 until the 2.94 paw table exists, since the server degrades a
// missing table to 0). Followers reads the SAME follow query the follow button uses
// (useProviderFollow), so the count stays in sync when the owner follows/unfollows.
export default function BusinessStatRow({ providerId, stats }) {
  const { t } = useTranslation();
  const { data: follow } = useProviderFollow(providerId);

  const s = stats ?? {};
  return (
    <SocialStatRow
      stats={[
        { key: "posts", value: s.postsCount ?? 0, label: t("storefront.social.posts") },
        {
          key: "paws",
          value: s.pawsCount ?? 0,
          label: t("storefront.social.paws"),
          color: COLORS.coral,
        },
        { key: "barks", value: s.barksCount ?? 0, label: t("storefront.social.barks") },
        {
          key: "followers",
          value: Number(follow?.followersCount ?? 0),
          label: t("storefront.social.followers"),
          color: COLORS.sageDark,
        },
      ]}
    />
  );
}
