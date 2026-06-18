import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/public/emergency/tag/[token] — PUBLIC, no auth. Pure pass-through of the SECURITY
// DEFINER fn app_emergency_card_by_tag (the whitelist lives in the DB fn, integration-proven).
// The route NEVER calls auth() and 404s when the fn returns null.

import { GET } from './route';
import sql from '@/app/api/utils/sql';

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const PARAMS = { params: { token: 'TAG1' } };
const req = () => new Request('http://localhost/api/public/emergency/tag/TAG1');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('public tag GET', () => {
  it('returns the whitelisted card the DEFINER fn produced (no auth)', async () => {
    const CARD = { pet: { name: 'Rex', has_home: true }, microchip_id: 'chip-1', medical: null };
    sql.mockResolvedValueOnce([{ card: CARD }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: CARD });
    // The ONLY query is the DEFINER tag fn — no broad table SELECT.
    const text = sql.mock.calls[0][0].join(' ');
    expect(text).toContain('app_emergency_card_by_tag');
    expect(text).not.toContain('pet_emergency_cards'); // table never read directly
  });

  it('404s when the tag is unknown/inactive (fn → null)', async () => {
    sql.mockResolvedValueOnce([{ card: null }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });
});
