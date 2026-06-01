/**
 * Web design mode — Anything's in-browser visual editor.
 *
 * No-op stub: the original implementation imported `initDesignMode` from
 * `../../../../shared/design-mode`, an Anything-internal package that is not part
 * of this export. That missing import broke SSR evaluation of the server entry
 * (all routes 500'd). We do not use the visual editor, so this module is now an
 * intentional no-op. Imported for side effects only by src/app/root.tsx.
 */

export {};
