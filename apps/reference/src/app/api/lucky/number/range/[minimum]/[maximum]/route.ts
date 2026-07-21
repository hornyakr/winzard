import { demoModule } from '@/composition/demo';
import { toLuckyNumberResponse } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRangeParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';
import { withRouteLifecycle } from '@/composition/http-kernel.server';
import { validationProblem } from '@/platform/http/problem';

import { luckyNumberRangeApiContract } from './route.contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = Readonly<{
  params: Promise<{ minimum: string; maximum: string }>;
}>;

export const GET = withRouteLifecycle<RouteContext>(
  luckyNumberRangeApiContract,
  'GET',
  async (_request, context, invocation) => {
    const parsed = luckyNumberRangeParamsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return validationProblem(parsed.error, {
        type: 'https://winzard.invalid/problems/invalid-lucky-number-range',
        title: 'Invalid lucky-number range',
        status: 400,
        code: 'INVALID_RANGE',
        requestId: invocation.requestContext.requestId,
      });
    }

    return Response.json(
      toLuckyNumberResponse(
        demoModule.queries.getLuckyNumber.execute(parsed.data, invocation.applicationContext),
      ),
      { status: 200 },
    );
  },
);
