import type { Route } from 'next';

function integerSegment(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError('A route builder csak biztonságos egész számot fogad.');
  return encodeURIComponent(String(value));
}

export const luckyNumberRoutes = Object.freeze({
  index: (): Route => '/lucky/number',
  query: (minimum: number, maximum: number): Route => {
    const query = new URLSearchParams({ minimum: String(minimum), maximum: String(maximum) });
    return `/lucky/number?${query.toString()}` as Route;
  },
  range: (minimum: number, maximum: number): Route =>
    `/lucky/number/range/${integerSegment(minimum)}/${integerSegment(maximum)}` as Route,
  api: (): Route => '/api/lucky/number',
  apiRange: (minimum: number, maximum: number): Route =>
    `/api/lucky/number/range/${integerSegment(minimum)}/${integerSegment(maximum)}` as Route,
});
