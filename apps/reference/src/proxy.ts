import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { luckyNumberRangeParamsSchema } from './modules/demo/lucky-number/presentation/lucky-number.schemas';

const dynamicRangePath = /^\/lucky\/number\/range\/([^/]+)\/([^/]+)\/?$/u;
const invalidRangeDocument = [
  '<!doctype html>',
  '<html lang="hu">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="robots" content="noindex">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Érvénytelen szerencseszám-tartomány</title>',
  '</head>',
  '<body>',
  '<main>',
  '<h1>Érvénytelen szerencseszám-tartomány.</h1>',
  '<p>A minimum, maximum vagy a tartomány mérete nem felel meg a szerződésnek.</p>',
  '<p><a href="/lucky/number">Vissza az alapértelmezett tartományhoz</a></p>',
  '</main>',
  '</body>',
  '</html>',
].join('');

export function proxy(request: NextRequest) {
  const match = dynamicRangePath.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();

  const parsed = luckyNumberRangeParamsSchema.safeParse({
    minimum: match[1],
    maximum: match[2],
  });
  if (parsed.success) return NextResponse.next();

  return new NextResponse(invalidRangeDocument, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const config = {
  matcher: '/lucky/number/range/:minimum/:maximum',
};
