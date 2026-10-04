// pathname -> registry SCREEN template. PURE. Never returns a raw path: anything that is not a registry screen
// is the bounded token "unknown". expo-router's usePathname() already drops (group) segments and query strings;
// this also tolerates them (and trailing slashes / "index") so the same function serves any caller.

import { SCREENS } from './registry';

const SCREEN_SET = new Set(SCREENS.filter((s) => s !== 'unknown'));

export function routeTemplate(pathname) {
  try {
    if (typeof pathname !== 'string' || pathname === '') return 'unknown';
    const clean = pathname.split(/[?#]/)[0];
    const segs = clean.split('/').filter((s) => s && !/^\(.*\)$/.test(s));
    if (segs[segs.length - 1] === 'index') segs.pop();
    const template = '/' + segs.join('/');
    return SCREEN_SET.has(template) ? template : 'unknown';
  } catch {
    return 'unknown';
  }
}
