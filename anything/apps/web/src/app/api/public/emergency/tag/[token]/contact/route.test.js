import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/public/emergency/tag/[token]/contact — PUBLIC relay to the owner via the DEFINER fn
// app_emergency_finder_message (0146), falling back to app_emergency_relay_contact on an older database.
// No auth; 200 with { ok } (a miss never leaks why), 400 only for a form without a usable contact.

import { POST } from './route';
import sql from '@/app/api/utils/sql';
import { sendEmergencyFinderPush } from '@/app/api/utils/emergencyPush';

// No real transaction here: withSavepoint (around the new function call) runs the query directly.
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn(), getActiveTx: () => null }));
vi.mock('@/app/api/utils/emergencyPush', () => ({ sendEmergencyFinderPush: vi.fn() }));

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

const delivered = {
  delivered: true,
  recipient_user_id: 7,
  pet_id: 3,
  pet_name: 'Rex',
  notification_id: 11,
  recent_count: 0,
};
const queryText = (call) => sql.mock.calls[call][0].join(' ');

describe('public relay contact POST', () => {
  it('relays the cleaned, bounded fields via the DEFINER fn, answers only ok, and pushes', async () => {
    sql.mockResolvedValueOnce([{ result: delivered }]);
    const res = await POST(
      post({ message: 'x'.repeat(900), finderName: ' Marta ', finderPhone: '123456', finderEmail: '' }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(queryText(0)).toContain('app_emergency_finder_message');
    expect(sql.mock.calls[0].slice(1)).toEqual(['TAG1', 'x'.repeat(500), 'Marta', '123456', '']);
    expect(sendEmergencyFinderPush).toHaveBeenCalledWith({
      recipient: 7,
      petId: 3,
      petName: 'Rex',
      finder: { name: 'Marta', phone: '123456', email: '', message: 'x'.repeat(500) },
      recentCount: 0,
    });
  });

  it.each([[null], [{ delivered: false }]])(
    'reports ok:false and pushes nothing when nothing was delivered (%o)',
    async (result) => {
      sql.mockResolvedValueOnce([{ result }]);
      const res = await POST(post({ message: 'hi', finderPhone: '123456' }), PARAMS);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false });
      expect(sendEmergencyFinderPush).not.toHaveBeenCalled();
    },
  );

  it('accepts an older page that sends only a message', async () => {
    sql.mockResolvedValueOnce([{ result: delivered }]);
    const res = await POST(post({ message: 'I found your dog!' }), PARAMS);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses a current form with no usable contact before touching the database', async () => {
    const res = await POST(post({ message: 'hi', finderName: 'Marta', finderPhone: '', finderEmail: '' }), PARAMS);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'contact_required' });
    expect(sql).not.toHaveBeenCalled();
  });

  it('falls back to the old relay, contact first, when the new function does not exist', async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error('no function'), { code: '42883' }));
    sql.mockResolvedValueOnce([{ ok: true }]);
    const res = await POST(post({ message: 'At the park', finderPhone: '123456' }), PARAMS);
    expect(await res.json()).toEqual({ ok: true });
    expect(queryText(1)).toContain('app_emergency_relay_contact');
    expect(sql.mock.calls[1].slice(1)).toEqual(['TAG1', 'Tel: 123456\nAt the park']);
    expect(sendEmergencyFinderPush).not.toHaveBeenCalled();
  });

  it('answers a soft failure on any other database error, without the fallback', async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '57014' }));
    const res = await POST(post({ message: 'hi', finderPhone: '123456' }), PARAMS);
    expect(await res.json()).toEqual({ ok: false });
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
