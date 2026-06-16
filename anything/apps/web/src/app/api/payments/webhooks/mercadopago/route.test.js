import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/payments/webhooks/mercadopago — handleWebhook is mocked. Proves the route is
// UNAUTHENTICATED (rail-called), passes raw body + headers for signature verification,
// returns 401 on an invalid signature, 200 on a verified flip, and 503 when unconfigured.

import { POST } from './route';
import { handleWebhook } from '@/app/api/utils/payments';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/app/api/utils/payments', () => ({ handleWebhook: vi.fn() }));

const webhookReq = (body) =>
  new Request('http://localhost/api/payments/webhooks/mercadopago', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/payments/webhooks/mercadopago', () => {
  it('verified flip → 200 with the new status', async () => {
    handleWebhook.mockResolvedValue({ ok: true, status: 'approved' });
    const res = await POST(webhookReq({ external_reference: '99', status: 'approved' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('approved');
    // Called with rail + headers + rawBody + parsed body.
    expect(handleWebhook).toHaveBeenCalledWith(
      'mercadopago',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-signature': 'ts=1,v1=abc' }),
        rawBody: expect.any(String),
        body: expect.objectContaining({ external_reference: '99' }),
      }),
    );
  });

  it('invalid signature → 401', async () => {
    handleWebhook.mockResolvedValue({ ok: false, reason: 'invalid_signature', status: 401 });
    const res = await POST(webhookReq({ data: { id: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('not configured → 503 (never crashes)', async () => {
    handleWebhook.mockRejectedValue(new PaymentsNotConfiguredError('mercadopago'));
    const res = await POST(webhookReq({}));
    expect(res.status).toBe(503);
  });
});
