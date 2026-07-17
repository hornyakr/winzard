import { demoModule } from '@/composition/demo';
import { luckyNumberRangeParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

type RouteContext = Readonly<{
  params: Promise<{ minimum: string; maximum: string }>;
}>;

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const parsed = luckyNumberRangeParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return Response.json({ code: 'INVALID_RANGE', issues: parsed.error.issues }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  return Response.json(demoModule.queries.getLuckyNumber.execute(parsed.data), {
    status: 200,
    headers: noStoreHeaders,
  });
}
