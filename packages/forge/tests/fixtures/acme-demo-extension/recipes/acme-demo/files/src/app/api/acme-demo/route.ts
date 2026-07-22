import { acmeDemoModule } from '@/composition/acme-demo.server';

export const runtime = 'nodejs';

export function GET(): Response {
  return Response.json({
    capability: 'acme-demo',
    queries: Object.keys(acmeDemoModule.queries),
  });
}
