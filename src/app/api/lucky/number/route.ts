import { demoModule } from '@/composition/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const result = demoModule.queries.getLuckyNumber.execute();

  return Response.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
