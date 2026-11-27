# TEMPORARY company identity on the legal pages — revert record

**Status: temporary. To be reverted.**

| | |
|---|---|
| Date of the change | 2026-11-27 |
| `origin/main` before the change | `c3d28e5b0e8471979713804cfa82540ada0e8c3d` |
| Temporary identity | Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain |
| Contact email | support@pawpi.info (unchanged) |
| Not provided, so not published | Registro Mercantil data |

## Previous dates and consent versions

| Document | Old "Last updated" (EN) | Old "Last updated" (ES) | New |
|---|---|---|---|
| Privacy Policy (web + `docs/legal` copy) | November 26, 2026 | 26 de noviembre de 2026 | 2026-11-27 |
| Terms of Service (web + `docs/legal` copy) | November 25, 2026 | 25 de noviembre de 2026 | 2026-11-27 |
| Support (web, `support.md`, `support.html`) | no date line | no date line | no date line |

| Constant (`anything/apps/web/src/constants/legal.js`) | Old | New |
|---|---|---|
| `TERMS_VERSION` | `2026-11-25` | `2026-11-27` |
| `PRIVACY_VERSION` | `2026-11-25` | `2026-11-27` |

Before this change the Privacy Policy date (November 26) was already one day later than `PRIVACY_VERSION` (`2026-11-25`).

## How to revert

The consent versions must move **forward** on a revert. Rows in `legal_consents` stamped `2026-11-27` mean "accepted the
temporary text", so never reuse an old version string or `2026-11-27` for the restored text.

### Option 1 — `git revert` the squash commit (preferred while no later change touched these files)

1. `git fetch origin main`
2. Find the commit: `git log origin/main --grep '^TEMP: ' --format='%h %s'`
3. In a new branch off `origin/main`: `git revert <that sha>` (one parent, so no `-m`). This also removes this file;
   read it afterwards with `git show <that sha>:docs/legal/TEMP-company-identity-revert.md`.
4. The revert restores the old dates and versions. Now set the "Last updated" line of Privacy and Terms (EN and ES, in
   `anything/apps/web/src/content/legal/` **and** `docs/legal/`) to the day of the revert, and set `TERMS_VERSION` and
   `PRIVACY_VERSION` to that same date.
5. Run `npm test` in `anything/apps/web`, open a PR, merge on green. Merging deploys to Railway.
6. If step 3 conflicts because a later change edited the same files, use option 2.

### Option 2 — restore by hand

1. For every `E` row in the table, replace the exact new string with the exact old string in each listed file.
   The "Last updated" rows are covered by step 4, and the two version rows by step 5.
2. Delete every added block `A1`–`A5` (full text below) from each listed file.
3. Delete `anything/apps/web/src/app/legal-companyIdentity.test.jsx`.
4. Set "Last updated" in Privacy and Terms (EN and ES, web and `docs/legal`) to the day of the revert.
5. Set `TERMS_VERSION` and `PRIVACY_VERSION` to that same date.
6. Check nothing is left: `git grep -n -e 'Tanquetats' -e 'B10579803' -- anything docs/legal` should only match this file.
   Then check the old identity is back: `git grep -n 'Matacos' -- anything/apps/web/src/content/legal`.
7. Run `npm test` in `anything/apps/web`, open a PR, merge on green.

### After either option

Open `/privacy`, `/terms` and `/support` (add `?lang=en` for English) and check the footer. Remove entry 4 from
`docs/todo-future.md` if it is still there.

## Every changed file: old and new strings

`<br>` in a cell is a line break in the file.

| ID | File | Lang | What | Exact old string | Exact new string |
|---|---|---|---|---|---|
| E1 | `anything/apps/web/src/content/legal/privacy.en.md` | EN | Last updated | `**Last updated:** November 26, 2026` | `**Last updated:** November 27, 2026` |
| E1 | `docs/legal/privacy-policy.md` | EN | Last updated | `**Last updated:** November 26, 2026` | `**Last updated:** November 27, 2026` |
| E2 | `anything/apps/web/src/content/legal/privacy.en.md` | EN | Privacy intro | `This Privacy Policy explains how Augusto Traversa ("PawPi," "we," "us") collects, uses, and` | `This Privacy Policy explains how Tanquetats 2022 ("PawPi," "we," "us") collects, uses, and` |
| E2 | `docs/legal/privacy-policy.md` | EN | Privacy intro | `This Privacy Policy explains how Augusto Traversa ("PawPi," "we," "us") collects, uses, and` | `This Privacy Policy explains how Tanquetats 2022 ("PawPi," "we," "us") collects, uses, and` |
| E3 | `anything/apps/web/src/content/legal/privacy.en.md` | EN | Privacy §1 controller block | `- **Augusto Traversa**`<br>`- Matacos y Alborada S/N`<br>`- Contact: **support@pawpi.info**` | `- **Tanquetats 2022**`<br>`- NIF/CIF: B10579803`<br>`- Calle Torrente 18 26, 46014 Valencia, Spain`<br>`- Contact: **support@pawpi.info**` |
| E3 | `docs/legal/privacy-policy.md` | EN | Privacy §1 controller block | `- **Augusto Traversa**`<br>`- Matacos y Alborada S/N`<br>`- Contact: **support@pawpi.info**` | `- **Tanquetats 2022**`<br>`- NIF/CIF: B10579803`<br>`- Calle Torrente 18 26, 46014 Valencia, Spain`<br>`- Contact: **support@pawpi.info**` |
| E4 | `anything/apps/web/src/content/legal/privacy.en.md` | EN | Privacy §16 contact | `Questions about this Policy or your data: **support@pawpi.info**, Augusto Traversa,`<br>`Matacos y Alborada S/N.` | `Questions about this Policy or your data: **support@pawpi.info**, Tanquetats 2022,`<br>`Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E4 | `docs/legal/privacy-policy.md` | EN | Privacy §16 contact | `Questions about this Policy or your data: **support@pawpi.info**, Augusto Traversa,`<br>`Matacos y Alborada S/N.` | `Questions about this Policy or your data: **support@pawpi.info**, Tanquetats 2022,`<br>`Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E5 | `anything/apps/web/src/content/legal/privacy.es.md` | ES | Last updated | `**Última actualización:** 26 de noviembre de 2026` | `**Última actualización:** 27 de noviembre de 2026` |
| E5 | `docs/legal/privacy-policy.es.md` | ES | Last updated | `**Última actualización:** 26 de noviembre de 2026` | `**Última actualización:** 27 de noviembre de 2026` |
| E6 | `anything/apps/web/src/content/legal/privacy.es.md` | ES | Privacy intro | `Esta Política de Privacidad explica cómo Augusto Traversa ("PawPi", "nosotros") recopila, usa y` | `Esta Política de Privacidad explica cómo Tanquetats 2022 ("PawPi", "nosotros") recopila, usa y` |
| E6 | `docs/legal/privacy-policy.es.md` | ES | Privacy intro | `Esta Política de Privacidad explica cómo Augusto Traversa ("PawPi", "nosotros") recopila, usa y` | `Esta Política de Privacidad explica cómo Tanquetats 2022 ("PawPi", "nosotros") recopila, usa y` |
| E7 | `anything/apps/web/src/content/legal/privacy.es.md` | ES | Privacy §1 controller block | `- **Augusto Traversa**`<br>`- Matacos y Alborada S/N`<br>`- Contacto: **support@pawpi.info**` | `- **Tanquetats 2022**`<br>`- NIF/CIF: B10579803`<br>`- Calle Torrente 18 26, 46014 Valencia, Spain`<br>`- Contacto: **support@pawpi.info**` |
| E7 | `docs/legal/privacy-policy.es.md` | ES | Privacy §1 controller block | `- **Augusto Traversa**`<br>`- Matacos y Alborada S/N`<br>`- Contacto: **support@pawpi.info**` | `- **Tanquetats 2022**`<br>`- NIF/CIF: B10579803`<br>`- Calle Torrente 18 26, 46014 Valencia, Spain`<br>`- Contacto: **support@pawpi.info**` |
| E8 | `anything/apps/web/src/content/legal/privacy.es.md` | ES | Privacy §16 contact | `Consultas sobre esta Política o tus datos: **support@pawpi.info**, Augusto Traversa,`<br>`Matacos y Alborada S/N.` | `Consultas sobre esta Política o tus datos: **support@pawpi.info**, Tanquetats 2022,`<br>`Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E8 | `docs/legal/privacy-policy.es.md` | ES | Privacy §16 contact | `Consultas sobre esta Política o tus datos: **support@pawpi.info**, Augusto Traversa,`<br>`Matacos y Alborada S/N.` | `Consultas sobre esta Política o tus datos: **support@pawpi.info**, Tanquetats 2022,`<br>`Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E9 | `anything/apps/web/src/content/legal/terms.en.md` | EN | Last updated | `**Last updated:** November 25, 2026` | `**Last updated:** November 27, 2026` |
| E9 | `docs/legal/terms-of-service.md` | EN | Last updated | `**Last updated:** November 25, 2026` | `**Last updated:** November 27, 2026` |
| E10 | `anything/apps/web/src/content/legal/terms.en.md` | EN | Terms intro (provider) | `"Service"), provided by Augusto Traversa ("PawPi," "we," "us"). By creating an account or using` | `"Service"), provided by Tanquetats 2022 ("PawPi," "we," "us"). By creating an account or using` |
| E10 | `docs/legal/terms-of-service.md` | EN | Terms intro (provider) | `"Service"), provided by Augusto Traversa ("PawPi," "we," "us"). By creating an account or using` | `"Service"), provided by Tanquetats 2022 ("PawPi," "we," "us"). By creating an account or using` |
| E11 | `anything/apps/web/src/content/legal/terms.en.md` | EN | Terms §15 governing law and courts | `These Terms are governed by the laws of Argentina, without regard to conflict-of-laws rules.`<br>`Disputes will be resolved in the courts of the City of Buenos Aires, Argentina, unless mandatory local law provides otherwise.` | `Unless mandatory consumer-protection law provides otherwise, these Terms are governed by Spanish`<br>`law, and disputes will be resolved in the courts of Valencia, Spain.` |
| E11 | `docs/legal/terms-of-service.md` | EN | Terms §15 governing law and courts | `These Terms are governed by the laws of Argentina, without regard to conflict-of-laws rules.`<br>`Disputes will be resolved in the courts of the City of Buenos Aires, Argentina, unless mandatory local law provides otherwise.` | `Unless mandatory consumer-protection law provides otherwise, these Terms are governed by Spanish`<br>`law, and disputes will be resolved in the courts of Valencia, Spain.` |
| E12 | `anything/apps/web/src/content/legal/terms.en.md` | EN | Terms §16 contact | `Questions about these Terms: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.` | `Questions about these Terms: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E12 | `docs/legal/terms-of-service.md` | EN | Terms §16 contact | `Questions about these Terms: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.` | `Questions about these Terms: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E13 | `anything/apps/web/src/content/legal/terms.es.md` | ES | Last updated | `**Última actualización:** 25 de noviembre de 2026` | `**Última actualización:** 27 de noviembre de 2026` |
| E13 | `docs/legal/terms-of-service.es.md` | ES | Last updated | `**Última actualización:** 25 de noviembre de 2026` | `**Última actualización:** 27 de noviembre de 2026` |
| E14 | `anything/apps/web/src/content/legal/terms.es.md` | ES | Terms intro (provider) | `relacionados (el "Servicio"), provistos por Augusto Traversa ("PawPi", "nosotros"). Al crear una` | `relacionados (el "Servicio"), provistos por Tanquetats 2022 ("PawPi", "nosotros"). Al crear una` |
| E14 | `docs/legal/terms-of-service.es.md` | ES | Terms intro (provider) | `relacionados (el "Servicio"), provistos por Augusto Traversa ("PawPi", "nosotros"). Al crear una` | `relacionados (el "Servicio"), provistos por Tanquetats 2022 ("PawPi", "nosotros"). Al crear una` |
| E15 | `anything/apps/web/src/content/legal/terms.es.md` | ES | Terms §15 governing law and courts | `Estos Términos se rigen por las leyes de la República Argentina, sin considerar sus normas de conflicto`<br>`de leyes. Las disputas se resolverán en los tribunales de la Ciudad de Buenos Aires, Argentina, salvo`<br>`que una ley local imperativa disponga lo contrario.` | `Salvo que la normativa imperativa de protección de las personas consumidoras disponga lo contrario,`<br>`estos Términos se rigen por la ley española y las disputas se resolverán en los juzgados y tribunales`<br>`de Valencia, España.` |
| E15 | `docs/legal/terms-of-service.es.md` | ES | Terms §15 governing law and courts | `Estos Términos se rigen por las leyes de la República Argentina, sin considerar sus normas de conflicto`<br>`de leyes. Las disputas se resolverán en los tribunales de la Ciudad de Buenos Aires, Argentina, salvo`<br>`que una ley local imperativa disponga lo contrario.` | `Salvo que la normativa imperativa de protección de las personas consumidoras disponga lo contrario,`<br>`estos Términos se rigen por la ley española y las disputas se resolverán en los juzgados y tribunales`<br>`de Valencia, España.` |
| E16 | `anything/apps/web/src/content/legal/terms.es.md` | ES | Terms §16 contact | `Consultas sobre estos Términos: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.` | `Consultas sobre estos Términos: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E16 | `docs/legal/terms-of-service.es.md` | ES | Terms §16 contact | `Consultas sobre estos Términos: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.` | `Consultas sobre estos Términos: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.` |
| E17 | `anything/apps/web/src/content/legal/support.en.md` | EN | Support footer identity line | `PawPi — Augusto Traversa, Matacos y Alborada S/N. Contact: **support@pawpi.info**` | `PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain. Contact: **support@pawpi.info**` |
| E17 | `docs/legal/support.md` | EN | Support footer identity line | `PawPi — Augusto Traversa, Matacos y Alborada S/N. Contact: **support@pawpi.info**` | `PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain. Contact: **support@pawpi.info**` |
| E18 | `anything/apps/web/src/content/legal/support.es.md` | ES | Support footer identity line | `PawPi — Augusto Traversa, Matacos y Alborada S/N. Contacto: **support@pawpi.info**` | `PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain. Contacto: **support@pawpi.info**` |
| E19 | `docs/legal/support.html` | EN | Support footer identity line | `<p>PawPi — Augusto Traversa, Matacos y Alborada S/N · support@pawpi.info</p>` | `<p>PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain · support@pawpi.info</p>` |
| E20 | `anything/apps/web/src/components/brand/SiteFooter.jsx` | EN + ES (one string) | Site footer copyright line | `© 2026 PawPi · Augusto Traversa` | `© 2026 PawPi · Tanquetats 2022` |
| E21 | `anything/apps/web/src/constants/legal.js` | n/a | TERMS_VERSION | `export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION \|\| "2026-11-25";` | `export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION \|\| "2026-11-27";` |
| E22 | `anything/apps/web/src/constants/legal.js` | n/a | PRIVACY_VERSION | `export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION \|\| "2026-11-25";` | `export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION \|\| "2026-11-27";` |
| E23 | `anything/apps/web/src/app/publicPagesContent.test.jsx` | EN + ES (one assertion) | Existing footer test | `expect(footer.getByText(/© 2026 PawPi · Augusto Traversa/)).toBeInTheDocument();` | `expect(footer.getByText(/© 2026 PawPi · Tanquetats 2022/)).toBeInTheDocument();` |
| A1 | `anything/apps/web/src/content/legal/privacy.en.md` | EN | Privacy §10 subsection: EU/Spain rights, AEPD, transfers (added) | (nothing) | full text under A1 below |
| A1 | `docs/legal/privacy-policy.md` | EN | Privacy §10 subsection: EU/Spain rights, AEPD, transfers (added) | (nothing) | full text under A1 below |
| A2 | `anything/apps/web/src/content/legal/privacy.es.md` | ES | Privacy §10 subsection: EU/Spain rights, AEPD, transfers (added) | (nothing) | full text under A2 below |
| A2 | `docs/legal/privacy-policy.es.md` | ES | Privacy §10 subsection: EU/Spain rights, AEPD, transfers (added) | (nothing) | full text under A2 below |
| A3 | `anything/apps/web/src/content/legal/terms.en.md` | EN | Terms §17 Legal notice (added) | (nothing) | full text under A3 below |
| A3 | `docs/legal/terms-of-service.md` | EN | Terms §17 Legal notice (added) | (nothing) | full text under A3 below |
| A4 | `anything/apps/web/src/content/legal/terms.es.md` | ES | Terms §17 Aviso legal (added) | (nothing) | full text under A4 below |
| A4 | `docs/legal/terms-of-service.es.md` | ES | Terms §17 Aviso legal (added) | (nothing) | full text under A4 below |
| A5 | `docs/todo-future.md` | EN | todo-future entry (added) | (nothing) | full text under A5 below |
| N1 | `anything/apps/web/src/app/legal-companyIdentity.test.jsx` | EN + ES | New test file (added) | (file did not exist) | delete the file |
| N2 | `docs/legal/TEMP-company-identity-revert.md` | EN | This record (added) | (file did not exist) | delete after the revert, or keep as history |

## Verbatim original text of everything replaced

### E1 — Last updated (EN)

Files: `anything/apps/web/src/content/legal/privacy.en.md`, `docs/legal/privacy-policy.md`

Original:

```text
**Last updated:** November 26, 2026
```

Replaced with:

```text
**Last updated:** November 27, 2026
```

### E2 — Privacy intro (EN)

Files: `anything/apps/web/src/content/legal/privacy.en.md`, `docs/legal/privacy-policy.md`

Original:

```text
This Privacy Policy explains how Augusto Traversa ("PawPi," "we," "us") collects, uses, and
```

Replaced with:

```text
This Privacy Policy explains how Tanquetats 2022 ("PawPi," "we," "us") collects, uses, and
```

### E3 — Privacy §1 controller block (EN)

Files: `anything/apps/web/src/content/legal/privacy.en.md`, `docs/legal/privacy-policy.md`

Original:

```text
- **Augusto Traversa**
- Matacos y Alborada S/N
- Contact: **support@pawpi.info**
```

Replaced with:

```text
- **Tanquetats 2022**
- NIF/CIF: B10579803
- Calle Torrente 18 26, 46014 Valencia, Spain
- Contact: **support@pawpi.info**
```

### E4 — Privacy §16 contact (EN)

Files: `anything/apps/web/src/content/legal/privacy.en.md`, `docs/legal/privacy-policy.md`

Original:

```text
Questions about this Policy or your data: **support@pawpi.info**, Augusto Traversa,
Matacos y Alborada S/N.
```

Replaced with:

```text
Questions about this Policy or your data: **support@pawpi.info**, Tanquetats 2022,
Calle Torrente 18 26, 46014 Valencia, Spain.
```

### E5 — Last updated (ES)

Files: `anything/apps/web/src/content/legal/privacy.es.md`, `docs/legal/privacy-policy.es.md`

Original:

```text
**Última actualización:** 26 de noviembre de 2026
```

Replaced with:

```text
**Última actualización:** 27 de noviembre de 2026
```

### E6 — Privacy intro (ES)

Files: `anything/apps/web/src/content/legal/privacy.es.md`, `docs/legal/privacy-policy.es.md`

Original:

```text
Esta Política de Privacidad explica cómo Augusto Traversa ("PawPi", "nosotros") recopila, usa y
```

Replaced with:

```text
Esta Política de Privacidad explica cómo Tanquetats 2022 ("PawPi", "nosotros") recopila, usa y
```

### E7 — Privacy §1 controller block (ES)

Files: `anything/apps/web/src/content/legal/privacy.es.md`, `docs/legal/privacy-policy.es.md`

Original:

```text
- **Augusto Traversa**
- Matacos y Alborada S/N
- Contacto: **support@pawpi.info**
```

Replaced with:

```text
- **Tanquetats 2022**
- NIF/CIF: B10579803
- Calle Torrente 18 26, 46014 Valencia, Spain
- Contacto: **support@pawpi.info**
```

### E8 — Privacy §16 contact (ES)

Files: `anything/apps/web/src/content/legal/privacy.es.md`, `docs/legal/privacy-policy.es.md`

Original:

```text
Consultas sobre esta Política o tus datos: **support@pawpi.info**, Augusto Traversa,
Matacos y Alborada S/N.
```

Replaced with:

```text
Consultas sobre esta Política o tus datos: **support@pawpi.info**, Tanquetats 2022,
Calle Torrente 18 26, 46014 Valencia, Spain.
```

### E9 — Last updated (EN)

Files: `anything/apps/web/src/content/legal/terms.en.md`, `docs/legal/terms-of-service.md`

Original:

```text
**Last updated:** November 25, 2026
```

Replaced with:

```text
**Last updated:** November 27, 2026
```

### E10 — Terms intro (provider) (EN)

Files: `anything/apps/web/src/content/legal/terms.en.md`, `docs/legal/terms-of-service.md`

Original:

```text
"Service"), provided by Augusto Traversa ("PawPi," "we," "us"). By creating an account or using
```

Replaced with:

```text
"Service"), provided by Tanquetats 2022 ("PawPi," "we," "us"). By creating an account or using
```

### E11 — Terms §15 governing law and courts (EN)

Files: `anything/apps/web/src/content/legal/terms.en.md`, `docs/legal/terms-of-service.md`

Original:

```text
These Terms are governed by the laws of Argentina, without regard to conflict-of-laws rules.
Disputes will be resolved in the courts of the City of Buenos Aires, Argentina, unless mandatory local law provides otherwise.
```

Replaced with:

```text
Unless mandatory consumer-protection law provides otherwise, these Terms are governed by Spanish
law, and disputes will be resolved in the courts of Valencia, Spain.
```

### E12 — Terms §16 contact (EN)

Files: `anything/apps/web/src/content/legal/terms.en.md`, `docs/legal/terms-of-service.md`

Original:

```text
Questions about these Terms: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.
```

Replaced with:

```text
Questions about these Terms: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.
```

### E13 — Last updated (ES)

Files: `anything/apps/web/src/content/legal/terms.es.md`, `docs/legal/terms-of-service.es.md`

Original:

```text
**Última actualización:** 25 de noviembre de 2026
```

Replaced with:

```text
**Última actualización:** 27 de noviembre de 2026
```

### E14 — Terms intro (provider) (ES)

Files: `anything/apps/web/src/content/legal/terms.es.md`, `docs/legal/terms-of-service.es.md`

Original:

```text
relacionados (el "Servicio"), provistos por Augusto Traversa ("PawPi", "nosotros"). Al crear una
```

Replaced with:

```text
relacionados (el "Servicio"), provistos por Tanquetats 2022 ("PawPi", "nosotros"). Al crear una
```

### E15 — Terms §15 governing law and courts (ES)

Files: `anything/apps/web/src/content/legal/terms.es.md`, `docs/legal/terms-of-service.es.md`

Original:

```text
Estos Términos se rigen por las leyes de la República Argentina, sin considerar sus normas de conflicto
de leyes. Las disputas se resolverán en los tribunales de la Ciudad de Buenos Aires, Argentina, salvo
que una ley local imperativa disponga lo contrario.
```

Replaced with:

```text
Salvo que la normativa imperativa de protección de las personas consumidoras disponga lo contrario,
estos Términos se rigen por la ley española y las disputas se resolverán en los juzgados y tribunales
de Valencia, España.
```

### E16 — Terms §16 contact (ES)

Files: `anything/apps/web/src/content/legal/terms.es.md`, `docs/legal/terms-of-service.es.md`

Original:

```text
Consultas sobre estos Términos: **support@pawpi.info**, Augusto Traversa, Matacos y Alborada S/N.
```

Replaced with:

```text
Consultas sobre estos Términos: **support@pawpi.info**, Tanquetats 2022, Calle Torrente 18 26, 46014 Valencia, Spain.
```

### E17 — Support footer identity line (EN)

Files: `anything/apps/web/src/content/legal/support.en.md`, `docs/legal/support.md`

Original:

```text
PawPi — Augusto Traversa, Matacos y Alborada S/N. Contact: **support@pawpi.info**
```

Replaced with:

```text
PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain. Contact: **support@pawpi.info**
```

### E18 — Support footer identity line (ES)

Files: `anything/apps/web/src/content/legal/support.es.md`

Original:

```text
PawPi — Augusto Traversa, Matacos y Alborada S/N. Contacto: **support@pawpi.info**
```

Replaced with:

```text
PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain. Contacto: **support@pawpi.info**
```

### E19 — Support footer identity line (EN)

Files: `docs/legal/support.html`

Original:

```text
<p>PawPi — Augusto Traversa, Matacos y Alborada S/N · support@pawpi.info</p>
```

Replaced with:

```text
<p>PawPi — Tanquetats 2022, NIF/CIF B10579803, Calle Torrente 18 26, 46014 Valencia, Spain · support@pawpi.info</p>
```

### E20 — Site footer copyright line (EN + ES (one string))

Files: `anything/apps/web/src/components/brand/SiteFooter.jsx`

Original:

```text
© 2026 PawPi · Augusto Traversa
```

Replaced with:

```text
© 2026 PawPi · Tanquetats 2022
```

### E21 — TERMS_VERSION (n/a)

Files: `anything/apps/web/src/constants/legal.js`

Original:

```text
export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-11-25";
```

Replaced with:

```text
export const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-11-27";
```

### E22 — PRIVACY_VERSION (n/a)

Files: `anything/apps/web/src/constants/legal.js`

Original:

```text
export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-11-25";
```

Replaced with:

```text
export const PRIVACY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_VERSION || "2026-11-27";
```

### E23 — Existing footer test (EN + ES (one assertion))

Files: `anything/apps/web/src/app/publicPagesContent.test.jsx`

Original:

```text
expect(footer.getByText(/© 2026 PawPi · Augusto Traversa/)).toBeInTheDocument();
```

Replaced with:

```text
expect(footer.getByText(/© 2026 PawPi · Tanquetats 2022/)).toBeInTheDocument();
```

## Full text of everything added

### A1 — Privacy §10 subsection: EU/Spain rights, AEPD, transfers (EN)

Files: `anything/apps/web/src/content/legal/privacy.en.md`, `docs/legal/privacy-policy.md`

Position: end of §10, directly before the "## 11." heading. Delete the block below plus the one blank line that separates it from its neighbour.

````markdown
### Rights under EU and Spanish data protection law

The data controller is established in Spain, so the EU General Data Protection Regulation (GDPR) and
Spain's Organic Law 3/2018 on the Protection of Personal Data and the Guarantee of Digital Rights
(LOPDGDD) apply to this processing, wherever you live. You have the rights of access, rectification,
erasure, restriction of processing, data portability, and objection. To exercise them, write to
**support@pawpi.info**. You also have the right to lodge a complaint with the Spanish Data Protection
Agency (Agencia Española de Protección de Datos, AEPD): [www.aepd.es](https://www.aepd.es). These
rights add to, and do not limit, any rights you have under the law of the place where you live.

Some of the providers listed in Section 8 may process your information outside the European Economic
Area; where the GDPR requires it, we use appropriate safeguards for those transfers (see Section 13).
````

### A2 — Privacy §10 subsection: EU/Spain rights, AEPD, transfers (ES)

Files: `anything/apps/web/src/content/legal/privacy.es.md`, `docs/legal/privacy-policy.es.md`

Position: end of §10, directly before the "## 11." heading. Delete the block below plus the one blank line that separates it from its neighbour.

````markdown
### Derechos según la normativa de protección de datos de la UE y de España

El responsable de los datos está establecido en España, por lo que a este tratamiento se le aplican el
Reglamento General de Protección de Datos de la UE (RGPD) y la Ley Orgánica 3/2018, de Protección de
Datos Personales y garantía de los derechos digitales (LOPDGDD), vivas donde vivas. Tenés derecho de
acceso, rectificación, supresión, limitación del tratamiento, portabilidad de los datos y oposición.
Para ejercerlos, escribinos a **support@pawpi.info**. También tenés derecho a presentar una
reclamación ante la Agencia Española de Protección de Datos (AEPD):
[www.aepd.es](https://www.aepd.es). Estos derechos se suman a los que tengas según la ley del lugar
donde vivís, y no los limitan.

Algunos de los proveedores indicados en la Sección 8 pueden procesar tu información fuera del Espacio
Económico Europeo; cuando el RGPD lo exige, usamos salvaguardas adecuadas para esas transferencias
(ver Sección 13).
````

### A3 — Terms §17 Legal notice (EN)

Files: `anything/apps/web/src/content/legal/terms.en.md`, `docs/legal/terms-of-service.md`

Position: end of the file, after §16. Delete the block below plus the one blank line that separates it from its neighbour.

````markdown
## 17. Legal notice

Information provided under Spain's Law 34/2002 on Information Society Services and Electronic
Commerce (LSSI-CE). The PawPi app and the pawpi.info website are provided by:

- **Legal name:** Tanquetats 2022
- **NIF/CIF:** B10579803
- **Address:** Calle Torrente 18 26, 46014 Valencia, Spain
- **Email:** **support@pawpi.info**
````

### A4 — Terms §17 Aviso legal (ES)

Files: `anything/apps/web/src/content/legal/terms.es.md`, `docs/legal/terms-of-service.es.md`

Position: end of the file, after §16. Delete the block below plus the one blank line that separates it from its neighbour.

````markdown
## 17. Aviso legal

Información facilitada conforme a la Ley 34/2002, de servicios de la sociedad de la información y de
comercio electrónico (LSSI-CE). La app PawPi y el sitio web pawpi.info son provistos por:

- **Razón social:** Tanquetats 2022
- **NIF/CIF:** B10579803
- **Domicilio:** Calle Torrente 18 26, 46014 Valencia, Spain
- **Correo electrónico:** **support@pawpi.info**
````

### A5 — todo-future entry (EN)

Files: `docs/todo-future.md`

Position: end of the file. Delete the block below plus the one blank line that separates it from its neighbour.

````markdown
## 4. TEMPORARY legal identity (Tanquetats 2022) — revert after the ElevenLabs grant answer

- **What it is:** the legal pages (privacy, terms, support, EN + ES), the `docs/legal` copies and the site footer name
  Tanquetats 2022 as controller/provider, and the Terms use Spanish law and the courts of Valencia. This is temporary.
- **To change it back:** follow [`docs/legal/TEMP-company-identity-revert.md`](legal/TEMP-company-identity-revert.md)
  (old and new strings, added sections, previous dates and consent versions).
````
