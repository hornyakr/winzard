import { demoModule } from '@/composition/demo.server';
import { toLuckyNumberResponse } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRequestSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';
import { withRouteLifecycle } from '@/composition/http-kernel.server';
import { problem, validationProblem } from '@/platform/http/problem';

import { luckyNumberApiContract } from './route.contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRouteLifecycle(
  luckyNumberApiContract,
  'GET',
  (_request, _routeContext, invocation) => Response.json(
    toLuckyNumberResponse(
      demoModule.queries.getLuckyNumber.execute({}, invocation.applicationContext),
    ),
    { status: 200 },
  ),
);

export const POST = withRouteLifecycle(
  luckyNumberApiContract,
  'POST',
  async (_request, _routeContext, invocation) => {
    const parsed = luckyNumberRequestSchema.safeParse(await invocation.readJsonBody());
    if (!parsed.success) {
      return validationProblem(parsed.error, {
        type: 'https://winzard.invalid/problems/invalid-lucky-number-range',
        title: 'Invalid lucky-number range',
        status: 422,
        code: 'INVALID_RANGE',
        requestId: invocation.requestContext.requestId,
      });
    }

    const result = demoModule.commands.generateLuckyNumber.execute(
      parsed.data,
      invocation.applicationContext,
    );
    if (result.kind === 'forbidden') {
      return problem({
        type: 'https://winzard.invalid/problems/forbidden',
        title: 'Forbidden',
        status: 403,
        code: 'FORBIDDEN',
        detail: 'Az egyedi tartomány operator szerepkört igényel.',
        requestId: invocation.requestContext.requestId,
      });
    }

    return Response.json(toLuckyNumberResponse(result.value), { status: 200 });
  },
);
