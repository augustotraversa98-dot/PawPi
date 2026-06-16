import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/payments/webhooks/binance — handleWebhook mocked. Unauthenticated; verifies
// signature via the layer; 401 invalid, 200 verified, 503 unconfigured. Also proves the
// nested `data` JSON string is flattened into the body for ref extraction.

import { POST } from './route';
import { handleWebhook } from '@/app/api/utils/payments';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/app/api/utils/payments', () => ({ handleWebhook: vi.fn() }));

const webhookReq = (body) =>
  new Request('http://localhost/api/payments/webhooks/binance', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'binancepay-signature': 'SIG',
      'binancepay-timestamp': '1',
      'binancepay-nonce': 'n',
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/payments/webhooks/binance', () => {
  it('verified flip → 200', async () => {
    handleWebhook.mockResolvedValue({ ok: true, status: 'approved' });
    const res = await POST(
      webhookReq({ bizStatus: 'PAY_SUCCESS', data: JSON.stringify({ merchantTradeNo: 'k2' }) }),
    );
    expect(res.status).toBe(200);
    // The nested data string was flattened so merchantTradeNo is on body.
    expect(handleWebhook).toHaveBeenCalledWith(
      'binance',
      expect.objectContaining({
        body: expect.objectContaining({ merchantTradeNo: 'k2', bizStatus: 'PAY_SUCCESS' }),
        rawBody: expect.any(String),
      }),
    );
  });

  it('invalid signature → 401', async () => {
    handleWebhook.mockResolvedValue({ ok: false, reason: 'invalid_signature', status: 401 });
    const res = await POST(webhookReq({ bizStatus: 'PAY_SUCCESS' }));
    expect(res.status).toBe(401);
  });

  it('not configured → 503', async () => {
    handleWebhook.mockRejectedValue(new PaymentsNotConfiguredError('binance'));
    const res = await POST(webhookReq({}));
    expect(res.status).toBe(503);
  });
});
