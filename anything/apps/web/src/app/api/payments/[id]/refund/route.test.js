import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/payments/[id]/refund — provider-admin scoped. requireProviderRole + the
// layer refund are mocked. Proves anon→401, 404 missing payment, 403 not-admin, success,
// and 503 not-configured.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';
import { refund } from '@/app/api/utils/payments';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({ requireProviderRole: vi.fn() }));
vi.mock('@/app/api/utils/payments', () => ({ refund: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '99' } };
const req = () =>
  new Request('http://localhost/api/payments/99/refund', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'admin', status: 'active' });
});

describe('POST /api/payments/[id]/refund', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('404 when the payment does not exist', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
  });

  it('403 when the caller is not provider owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 99, order_id: 10, provider_id: 5, rail: 'mercadopago' }]);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('Not authorized for this provider'), { status: 403 }),
    );
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(403);
    expect(refund).not.toHaveBeenCalled();
  });

  it('admin refund → 200', async () => {
    auth.mockResolvedValue(SESSION);
    const payment = { id: 99, order_id: 10, provider_id: 5, rail: 'mercadopago' };
    sql.mockResolvedValueOnce([payment]);
    refund.mockResolvedValue({ status: 'refunded' });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('refunded');
    expect(requireProviderRole).toHaveBeenCalledWith(5, 7);
    expect(refund).toHaveBeenCalledWith(payment);
  });

  it('not configured → 503', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 99, order_id: 10, provider_id: 5, rail: 'binance' }]);
    refund.mockRejectedValue(new PaymentsNotConfiguredError('binance'));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
  });
});
