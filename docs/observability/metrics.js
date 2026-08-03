// anything/apps/web/src/lib/metrics.js
//
// Optional business-level metrics (Phase 2). Safe no-op if OTel isn't running
// (the @opentelemetry/api falls back to a no-op meter when no SDK is present).
//
// Usage in a route:
//   import { paymentAttempt, paymentFailure } from '@/lib/metrics';
//   paymentAttempt.add(1, { provider: 'mercadopago' });
//   paymentFailure.add(1, { provider: 'mercadopago', reason: 'declined' });

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('pawpi-business', '1.0.0');

// Counters — cheap, additive, one line per event.
export const paymentAttempt = meter.createCounter('pawpi.payment.attempt', {
  description: 'Payment / checkout attempts',
});
export const paymentSuccess = meter.createCounter('pawpi.payment.success', {
  description: 'Payments confirmed',
});
export const paymentFailure = meter.createCounter('pawpi.payment.failure', {
  description: 'Payments that failed (declined, error, timeout)',
});
export const authFailure = meter.createCounter('pawpi.auth.failure', {
  description: 'Auth/sign-in failures',
});
export const dbError = meter.createCounter('pawpi.db.error', {
  description: 'Database query errors caught in API routes',
});

// Histogram for a critical flow's end-to-end time (optional).
export const bookingLatency = meter.createHistogram('pawpi.booking.duration', {
  description: 'Booking flow duration (ms)',
  unit: 'ms',
});
