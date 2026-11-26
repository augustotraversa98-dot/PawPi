import { createHash } from "node:crypto";
import { BlockList, isIP } from "node:net";

// WHO is sending an anonymous request, for limits a sender must not be able to talk its way around.
//
// The path to this server is client → (Cloudflare, for www.pawpi.info) → Railway edge → app, and the Railway domain
// can also be called directly. So:
//   • X-Real-IP is set by Railway's edge to the address that connected to it (docs: "Specs & Limits");
//   • CF-Connecting-IP is the visitor, but anyone calling Railway directly can write it, so it counts only when the
//     address that connected to Railway is one of Cloudflare's;
//   • the FIRST X-Forwarded-For entry is whatever the client typed, so it is never used here. The LAST one (added by
//     the nearest proxy) is the fallback when there is no X-Real-IP (local runs, other hosts).

// https://www.cloudflare.com/ips-v4 and /ips-v6, read 2026-11-26. If Cloudflare adds a range that is missing here,
// senders behind it share the limit of that Cloudflare address until the list is updated.
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [address, prefix] = range.split("/");
  cloudflare.addSubnet(address, Number(prefix), address.includes(":") ? "ipv6" : "ipv4");
}

/** A plain IPv4 / IPv6 address (IPv4-mapped IPv6 becomes IPv4), or null for anything else. */
function parseAddress(value) {
  const text = String(value ?? "").trim().split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(text);
  const address = mapped ? mapped[1] : text;
  return isIP(address) ? address : null;
}

const isCloudflare = (address) => cloudflare.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");

/** The visitor's address as far as the proxies in front of us vouch for it, or null. */
export function visitorAddress(request) {
  const header = (name) => request?.headers?.get?.(name) ?? "";
  const peer =
    parseAddress(header("x-real-ip")) ?? parseAddress(header("x-forwarded-for").split(",").pop());
  if (!peer) return null;
  if (!isCloudflare(peer)) return peer;
  return parseAddress(header("cf-connecting-ip")) ?? peer;
}

// One home connection usually holds a whole IPv6 /64, so every address in it is the same sender.
function ipv6Network(address) {
  const [head, tail = ""] = address.toLowerCase().split("::");
  const groups = (part) => (part ? part.split(":") : []);
  const left = groups(head);
  const right = groups(tail);
  // A trailing dotted IPv4 part stands for two groups.
  const width = (list) => list.length + (list.at(-1)?.includes(".") ? 1 : 0);
  const gap = address.includes("::") ? Math.max(0, 8 - width(left) - width(right)) : 0;
  return [...left, ...Array(gap).fill("0"), ...right]
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * The rate-limit subject for an anonymous sender, or null when no address is known. Hashed, so the limiter's table
 * does not keep a readable address. A signed-in session is deliberately ignored: new accounts must not buy new limits.
 */
export function anonymousSender(request) {
  const address = visitorAddress(request);
  if (!address) return null;
  return `ip:${hash(isIP(address) === 6 ? ipv6Network(address) : address)}`;
}

/** The same sender, counted separately for one link token (which is not stored either). */
export function senderForToken(sender, token) {
  return `${sender}:t:${hash(String(token))}`;
}
