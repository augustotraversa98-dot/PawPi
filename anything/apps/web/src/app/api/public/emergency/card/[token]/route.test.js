import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/public/emergency/card/[token] — PUBLIC vet link. Pass-through of the DEFINER fn
// app_emergency_card_by_link (enforces scope/expiry/revoke in the DB; integration-proven).

import { GET } from './route';
import sql from '@/app/api/utils/sql';

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const PARAMS = { params: { token: 'LINK1' } };
const req = () => new Request('http://localhost/api/public/emergency/card/LINK1');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('public card (vet link) GET', () => {
  it('returns the scoped card the DEFINER fn produced', async () => {
    const CARD = { pet: { name: 'Rex' }, medical: { allergies: [] } };
    sql.mockResolvedValueOnce([{ card: CARD }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: CARD });
    const text = sql.mock.calls[0][0].join(' ');
    expect(text).toContain('app_emergency_card_by_link');
    expect(text).not.toContain('pet_emergency_share_links'); // never reads the table directly
  });

  it('404s for a revoked/expired/unknown link (fn → null)', async () => {
    sql.mockResolvedValueOnce([{ card: null }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });
});
