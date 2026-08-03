import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('pawpi-business', '1.0.0');
export const paymentAttempt = meter.createCounter('pawpi.payment.attempt', {
  description: 'Payment/checkout attempts',
});
export const paymentSuccess = meter.createCounter('pawpi.payment.success', {
  description: 'Payments approved',
});
export const paymentFailure = meter.createCounter('pawpi.payment.failure', {
  description: 'Payments failed',
});
