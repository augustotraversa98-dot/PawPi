// The words of the sharing UI, in EN and ES: raw server words ("pending", "Former member") never reach a person.
import {
  grantStatusLabel,
  roleLabel,
  roleBadgeLabel,
  memberDisplayName,
  sharedByLabel,
  granteeLabel,
} from "./sharingLabels";

const makeT = (lang) => {
  const catalog = lang === "es" ? require("@/i18n/locales/es.json") : require("@/i18n/locales/en.json");
  return (key, vars) => {
    let s = key.split(".").reduce((o, part) => (o == null ? o : o[part]), catalog);
    if (typeof s !== "string") return key;
    for (const [n, v] of Object.entries(vars || {})) s = s.replace(new RegExp(`{{${n}}}`, "g"), String(v));
    return s;
  };
};

describe.each([
  ["en", { pending: "Pending", active: "Active", revoked: "Access removed", expired: "Expired", left: "Left", declined: "Declined", former: "Former member" }],
  ["es", { pending: "Pendiente", active: "Activo", revoked: "Acceso quitado", expired: "Vencido", left: "Se fue", declined: "Rechazado", former: "Ex integrante" }],
])("sharing labels (%s)", (lang, w) => {
  const t = makeT(lang);

  test("every grant status reads as a word in the person's language", () => {
    expect(grantStatusLabel(t, "pending")).toBe(w.pending);
    expect(grantStatusLabel(t, "active")).toBe(w.active);
    expect(grantStatusLabel(t, "revoked")).toBe(w.revoked);
    expect(grantStatusLabel(t, "expired")).toBe(w.expired);
    expect(grantStatusLabel(t, "left")).toBe(w.left);
    expect(grantStatusLabel(t, "declined")).toBe(w.declined);
  });

  test("an unknown status never leaks the raw string", () => {
    const label = grantStatusLabel(t, "weird_internal_state");
    expect(label).not.toContain("weird");
    expect(label.length).toBeGreaterThan(0);
  });

  test("the server's English 'Former member' is translated; real names pass through; empty is null", () => {
    expect(memberDisplayName(t, "Former member")).toBe(w.former);
    expect(memberDisplayName(t, "  former member ")).toBe(w.former);
    expect(memberDisplayName(t, "María")).toBe("María");
    expect(memberDisplayName(t, "")).toBeNull();
    expect(memberDisplayName(t, null)).toBeNull();
  });

  test("an anonymised ex-member (username former_member_xxxx) shows as 'Former member', a normal one as @handle", () => {
    expect(granteeLabel(t, "former_member_8f3a1c")).toBe(w.former);
    expect(granteeLabel(t, "FORMER_MEMBER_8F3A1C")).toBe(w.former);
    expect(granteeLabel(t, "maria")).toBe("@maria");
    expect(granteeLabel(t, null)).toBe(w.former);
  });

  test("roles and badges are translated for all three roles", () => {
    for (const role of ["owner", "family", "caregiver"]) {
      expect(roleLabel(t, role)).not.toMatch(/^sharedDog\./);
      expect(roleBadgeLabel(t, role)).not.toMatch(/^sharedDog\./);
    }
  });

  test("'shared by' names the owner when known, else a neutral line (never a username or e-mail)", () => {
    expect(sharedByLabel(t, "Sam")).toContain("Sam");
    expect(sharedByLabel(t, null)).not.toContain("null");
    expect(sharedByLabel(t, null)).toBe(lang === "es" ? "Compartido con vos" : "Shared with you");
  });
});

test("EN and ES catalogs define the same sharedDog keys, and ES is not a copy of EN", () => {
  const en = require("@/i18n/locales/en.json").sharedDog;
  const es = require("@/i18n/locales/es.json").sharedDog;
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  const same = Object.keys(en).filter((k) => en[k] === es[k]);
  expect(same).toEqual([]);
});
