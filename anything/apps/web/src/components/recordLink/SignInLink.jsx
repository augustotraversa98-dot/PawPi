import { useState } from "react";
import { BRAND } from "@/lib/brand/tokens";
import { keepReturnToken, newReturnId, signInHref } from "./signInReturn";

const link = { color: BRAND.brown, textDecoration: "underline", fontWeight: 700 };

// Leaves for the sign-in page and comes back to this same link.
export function SignInLink({ token, children }) {
  const [id] = useState(newReturnId);
  const keep = () => keepReturnToken(id, token);
  return (
    <a href={signInHref(id)} onClick={keep} onAuxClick={keep} style={link}>
      {children}
    </a>
  );
}
