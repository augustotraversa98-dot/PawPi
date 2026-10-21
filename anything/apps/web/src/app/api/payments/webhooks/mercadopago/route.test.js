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

  it('forwards the QUERY STRING (data.id / type / order_ref) to the layer — MercadoPago sends the id there (F3-02)', async () => {
    handleWebhook.mockResolvedValue({ ok: true, status: 'approved', applied: true });
    const req = new Request(
      'http://localhost/api/payments/webhooks/mercadopago?order_ref=4821&data.id=1320000000001&type=payment',
      { method: 'POST', headers: { 'x-signature': 'ts=1,v1=abc' }, body: JSON.stringify({ type: 'payment' }) },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).applied).toBe(true);
    expect(handleWebhook).toHaveBeenCalledWith(
      'mercadopago',
      expect.objectContaining({
        query: { order_ref: '4821', 'data.id': '1320000000001', type: 'payment' },
      }),
    );
  });

  it('an empty body with a query string (legacy IPN) is handled, not a parse error', async () => {
    handleWebhook.mockResolvedValue({ ok: true, status: 'ignored', reason: 'unsupported_topic' });
    const res = await POST(
      new Request('http://localhost/api/payments/webhooks/mercadopago?id=1&topic=merchant_order', {
        method: 'POST',
        headers: { 'x-signature': 'ts=1,v1=abc' },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledWith('mercadopago', expect.objectContaining({ body: {} }));
  });

  it('a settlement failure (MP down, seller not connected, migration not applied) → 500 so MercadoPago REDELIVERS', async () => {
    handleWebhook.mockRejectedValue(new Error('MercadoPago status fetch failed (502)'));
    const res = await POST(webhookReq({ data: { id: '1' } }));
    expect(res.status).toBe(500);
  });

  it('never logs the request body or query string', async () => {
    handleWebhook.mockRejectedValue(new Error('boom'));
    await POST(webhookReq({ data: { id: 'SENSITIVE-ID-123' }, payer: { email: 'pii@example.com' } }));
    const logged = JSON.stringify(console.error.mock.calls);
    expect(logged).not.toContain('SENSITIVE-ID-123');
    expect(logged).not.toContain('pii@example.com');
  });

  it('not configured → 503 (never crashes)', async () => {
    handleWebhook.mockRejectedValue(new PaymentsNotConfiguredError('mercadopago'));
    const res = await POST(webhookReq({}));
    expect(res.status).toBe(503);
  });
});
