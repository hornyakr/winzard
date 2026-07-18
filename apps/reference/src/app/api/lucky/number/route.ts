import { demoModule } from '@/composition/demo';
import { toLuckyNumberResponse } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberActorFromRequest } from '@/modules/demo/lucky-number/presentation/lucky-number.http';
import { luckyNumberRequestSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';
import { isJsonContentType, problem, validationProblem } from '@/platform/http/problem';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

export function GET(): Response {
  return Response.json(toLuckyNumberResponse(demoModule.queries.getLuckyNumber.execute()), {
    status: 200,
    headers: noStoreHeaders,
  });
}

export async function POST(request: Request): Promise<Response> {
  const actor = luckyNumberActorFromRequest(request);
  if (!demoModule.policies.luckyNumber.canGenerateCustomRange(actor)) {
    return problem({
      type: 'https://winzard.invalid/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Az egyedi tartomány operator szerepkört igényel.',
    });
  }
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return problem({
      type: 'https://winzard.invalid/problems/unsupported-media-type',
      title: 'Unsupported Media Type',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem({
      type: 'https://winzard.invalid/problems/malformed-json',
      title: 'Malformed JSON',
      status: 400,
      code: 'MALFORMED_JSON',
    });
  }

  const parsed = luckyNumberRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationProblem(parsed.error, {
      type: 'https://winzard.invalid/problems/invalid-lucky-number-range',
      title: 'Invalid lucky-number range',
      status: 422,
      code: 'INVALID_RANGE',
    });
  }

  const result = demoModule.commands.generateLuckyNumber.execute({ actor, ...parsed.data });
  if (result.kind === 'forbidden') {
    return problem({
      type: 'https://winzard.invalid/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
    });
  }

  return Response.json(toLuckyNumberResponse(result.value), {
    status: 200,
    headers: noStoreHeaders,
  });
}
