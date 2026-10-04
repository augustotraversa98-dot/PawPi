// pawpi_business_events_total -- the product-health counter ("did anyone sign up / create a pet / book
// today?"). ANONYMOUS by design: labels are event + outcome + method from CLOSED lists (contract). No user,
// pet or provider ids, ever. Unknown values are dropped, never thrown; with no OTel SDK this is a no-op.

import { metrics } from '@opentelemetry/api';

export const BUSINESS_EVENTS = Object.freeze([
  'signup',
  'signin',
  'pet_created',
  'post_created',
  'health_log_created',
  'routine_created',
  'booking_created',
  'order_created',
  'push_token_registered',
  'walk_logged',
]);
export const BUSINESS_OUTCOMES = Object.freeze(['ok', 'fail']);
export const BUSINESS_METHODS = Object.freeze(['credentials', 'google', 'apple', 'none']);

const counter = metrics
  .getMeter('pawpi-business', '1.0.0')
  .createCounter('pawpi_business_events_total', {
    description: 'Product events (signups, pets, posts, bookings, orders, ...) by outcome and auth method',
  });

/**
 * Count one business event. Fire-and-forget: validates against the contract lists, never throws.
 * @returns {boolean} whether the event was recorded (false = dropped as invalid)
 */
export function recordBusinessEvent(event, outcome = 'ok', method = 'none') {
  try {
    if (
      !BUSINESS_EVENTS.includes(event) ||
      !BUSINESS_OUTCOMES.includes(outcome) ||
      !BUSINESS_METHODS.includes(method)
    ) {
      return false;
    }
    counter.add(1, { event, outcome, method });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap an Auth.js Credentials `authorize` so its result is counted: a truthy user -> ok, null/falsy or a
 * thrown error -> fail. The wrapped function returns / throws EXACTLY what the original does.
 */
export function observeAuthorize(event, method, authorize) {
  return async (...args) => {
    let user;
    try {
      user = await authorize(...args);
    } catch (err) {
      recordBusinessEvent(event, 'fail', method);
      throw err;
    }
    recordBusinessEvent(event, user ? 'ok' : 'fail', method);
    return user;
  };
}
