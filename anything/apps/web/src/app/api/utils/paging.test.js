import { describe, it, expect } from 'vitest';
import { parsePaging, DEFAULT_LIMIT, MAX_LIMIT } from './paging';

const sp = (qs) => new URL(`http://x/?${qs}`).searchParams;

describe('parsePaging', () => {
  it('defaults and clamps', () => {
    expect(parsePaging(sp(''))).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
    expect(parsePaging(sp('limit=50&offset=100'))).toEqual({ limit: 50, offset: 100 });
    expect(parsePaging(sp('limit=99999'))).toEqual({ limit: MAX_LIMIT, offset: 0 });
    expect(parsePaging(sp('limit=0&offset=-5'))).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
    expect(parsePaging(sp('limit=abc&offset=nope'))).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
  });
});
