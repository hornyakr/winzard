import { demoModule } from '@/composition/demo';
import { luckyNumberActorFromRequest } from '@/modules/demo/lucky-number/presentation/lucky-number.http';
import { luckyNumberRequestSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

export function GET(): Response {
  return Response.json(demoModule.queries.getLuckyNumber.execute(), {
    status: 200,
    headers: noStoreHeaders,
  });
}

export async function POST(request: Request): Promise<Response> {
  const actor = luckyNumberActorFromRequest(request);
  if (!demoModule.policies.luckyNumber.canGenerateCustomRange(actor)) {
    return Response.json({ code: 'FORBIDDEN', message: 'Az egyedi tartomány operator szerepkört igényel.' }, {
      status: 403,
      headers: noStoreHeaders,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: 'INVALID_JSON', message: 'Érvényes JSON body szükséges.' }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  const parsed = luckyNumberRequestSchema.safeParse(body);
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
