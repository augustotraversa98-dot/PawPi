// Markdown renderings of the public pages, for agents that ask for text/markdown. Built only from what
// the pages themselves show — the homepage copy module and the legal/support markdown — so there is no
// second set of words to keep in step.
import { APP_STORE_BADGE_LABELS, appStoreUrl, SITE_URL } from "@/lib/brand/tokens";
import { HOME_COPY } from "@/lib/home/copy";
import { GET_APP_TITLES, LEGAL_TITLES } from "@/lib/legal/titles";
import privacyEn from "@/content/legal/privacy.en.md?raw";
import privacyEs from "@/content/legal/privacy.es.md?raw";
import termsEn from "@/content/legal/terms.en.md?raw";
import termsEs from "@/content/legal/terms.es.md?raw";
import eulaEn from "@/content/legal/eula.en.md?raw";
import eulaEs from "@/content/legal/eula.es.md?raw";
import supportEn from "@/content/legal/support.en.md?raw";
import supportEs from "@/content/legal/support.es.md?raw";

const LEGAL_CONTENT = {
  privacy: { es: privacyEs, en: privacyEn },
  terms: { es: termsEs, en: termsEn },
  eula: { es: eulaEs, en: eulaEn },
  support: { es: supportEs, en: supportEn },
};

const storeLink = (lang) => `[${APP_STORE_BADGE_LABELS[lang]}](${appStoreUrl(lang)})`;

function homeMarkdown(lang) {
  const t = HOME_COPY[lang];
  const query = lang === "en" ? "?lang=en" : "";
  const pageUrl = (path) => `${SITE_URL}${path}${query}`;
  const bullets = (items) => items.map((item) => `- ${item}`).join("\n");

  return [
    `# ${t.hero.title.join(" ")}`,
    t.hero.sub,
    storeLink(lang),
    `## ${t.featuresEyebrow}`,
    bullets(t.features.map((f) => `**${f.title}**: ${f.body}`)),
    `## ${t.dailyEyebrow}`,
    bullets(t.daily.map((item) => item.title)),
    ...t.sections.flatMap((s) => [
      `## ${s.title}`,
      s.eyebrow,
      bullets(s.bullets),
      ...(s.note ? [`> ${s.note}`] : []),
    ]),
    `## ${t.audienceEyebrow}`,
    ...t.audiences.flatMap((a) => [
      `### ${a.title}`,
      a.body,
      `[${a.cta.label}](${a.cta.appStore ? appStoreUrl(lang) : pageUrl(a.cta.href)})`,
    ]),
    `[${t.businessSignin}](${pageUrl("/account/signin")})`,
    `## ${t.closing.title}`,
    t.closing.body,
    storeLink(lang),
  ].join("\n\n");
}

function legalMarkdown(page, lang) {
  return [
    `# ${LEGAL_TITLES[page][lang]}`,
    // The support page also carries the "get the app" block.
    ...(page === "support" ? [`**${GET_APP_TITLES[lang]}**: ${storeLink(lang)}`] : []),
    LEGAL_CONTENT[page][lang].trim(),
  ].join("\n\n");
}

// Pages that have a markdown version, by path.
export const MARKDOWN_PATHS = ["/", "/privacy", "/terms", "/eula", "/support"];

export function markdownPage(path, lang) {
  const body = path === "/" ? homeMarkdown(lang) : legalMarkdown(path.slice(1), lang);
  return `${body}\n`;
}
