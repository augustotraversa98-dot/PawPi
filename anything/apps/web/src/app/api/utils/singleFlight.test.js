import { describe, it, expect } from 'vitest';
import { singleFlightEnabled, preparedStatementsAllowed } from './singleFlight';

describe('REQUEST_SINGLE_FLIGHT flag', () => {
  it('is OFF by default and for anything that is not an explicit yes', () => {
    expect(singleFlightEnabled({})).toBe(false);
    for (const v of ['', 'off', '0', 'false', 'no', 'maybe', 'onn']) {
      expect(singleFlightEnabled({ REQUEST_SINGLE_FLIGHT: v })).toBe(false);
    }
  });

  it('turns on for on / 1 / true / yes, any case, surrounding spaces ignored', () => {
    for (const v of ['on', 'ON', '1', 'true', 'True', 'yes', ' on ']) {
      expect(singleFlightEnabled({ REQUEST_SINGLE_FLIGHT: v })).toBe(true);
    }
  });
});

describe('prepared statements and the pooler port', () => {
  it('are refused on the transaction-mode port (6543: 26000 "prepared statement does not exist")', () => {
    expect(preparedStatementsAllowed(6543)).toBe(false);
    expect(preparedStatementsAllowed('6543')).toBe(false);
  });

  it('are allowed on the session-mode port, a direct connection, and a default port', () => {
    expect(preparedStatementsAllowed(5432)).toBe(true);
    expect(preparedStatementsAllowed(54329)).toBe(true);
    expect(preparedStatementsAllowed(undefined)).toBe(true);
  });
});
