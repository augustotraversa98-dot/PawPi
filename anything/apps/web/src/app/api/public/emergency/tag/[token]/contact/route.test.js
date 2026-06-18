import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/public/emergency/tag/[token]/contact — PUBLIC relay to the owner via the DEFINER fn
// app_emergency_relay_contact. No auth; always 200 with { ok } (a miss never leaks why).

import { POST } from './route';
import sql from '@/app/api/utils/sql';

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const PARAMS = { params: { token: 'TAG1' } };
const post = (body) =>
  new Request('http://localhost/api/public/emergency/tag/TAG1/contact', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('public relay contact POST', () => {
  it('relays the (truncated) message via the DEFINER fn and returns ok', async () => {
    sql.mockResolvedValueOnce([{ ok: true }]);
    const res = await POST(post({ message: 'I found your dog!' }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const text = sql.mock.calls[0][0].join(' ');
    expect(text).toContain('app_emergency_relay_contact');
  });

  it('reports ok:false when the relay finds no target (non-relay/inactive)', async () => {
    sql.mockResolvedValueOnce([{ ok: false }]);
    const res = await POST(post({ message: 'hi' }), PARAMS);
    expect(await res.json()).toEqual({ ok: false });
  });
});
