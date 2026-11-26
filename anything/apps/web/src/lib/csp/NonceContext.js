import { createContext } from "react";

// The Content-Security-Policy nonce of the page being server-rendered. src/app/entry.server.tsx
// provides it and root.tsx puts it on the inline scripts. In the browser it is undefined: the
// scripts have already run, and the browser hides their nonce attribute.
export const NonceContext = createContext(undefined);
