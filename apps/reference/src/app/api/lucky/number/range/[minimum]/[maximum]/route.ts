import { demoModule } from '@/composition/demo';
import { toLuckyNumberResponse } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRangeParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';
import { validationProblem } from '@/platform/http/problem';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

type RouteContext = Readonly<{
  params: Promise<{ minimum: string; maximum: string }>;
}>;

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const parsed = luckyNumberRangeParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return validationProblem(parsed.error, {
      type: 'https://winzard.invalid/problems/invalid-lucky-number-range',
      title: 'Invalid lucky-number range',
      status: 400,
      code: 'INVALID_RANGE',
    });
  }

  return Response.json(toLuckyNumberResponse(demoModule.queries.getLuckyNumber.execute(parsed.data)), {
    status: 200,
    headers: noStoreHeaders,
  });
}
