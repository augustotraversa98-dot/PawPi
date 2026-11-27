// What marks the website's sign-in and sign-up pages as the business ones, and sends pet owners to the app.
import { appStoreUrl } from "@/lib/brand/tokens";

export function BusinessEyebrow({ copy }) {
  return (
    <p className="mb-3 inline-block rounded-full bg-[#FFD9B3] px-3 py-1 text-xs font-bold text-[#3B241B]">
      {copy.business.eyebrow}
    </p>
  );
}

export function PetOwnerNote({ copy, lang }) {
  return (
    <p className="border-t border-[#FFD9B3] pt-4 text-center text-sm text-[#7A6254]">
      {copy.business.petOwner}{" "}
      <a
        href={appStoreUrl(lang)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#FF6F61] hover:underline"
      >
        {copy.business.getApp}
      </a>
    </p>
  );
}
