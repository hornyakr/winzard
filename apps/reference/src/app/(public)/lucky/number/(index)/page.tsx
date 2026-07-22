import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { demoModule } from '@/composition/demo.server';
import { LuckyNumberView, presentLuckyNumber } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRangeQuerySchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';
import { enforcePageContract } from '@/platform/http/delivery-contract';
import { createPageRequestContext, toApplicationContext } from '@/composition/request-context.server';

import { luckyNumberPageContract } from './page.contract';

export const runtime = 'nodejs';
enforcePageContract(luckyNumberPageContract);

export const metadata: Metadata = {
  title: 'Szerencseszám',
  description: 'A Winzard első request-time renderelt példaoldala.',
};

type LuckyNumberPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function LuckyNumberPage({ searchParams }: LuckyNumberPageProps) {
  await connection();
  const parsed = luckyNumberRangeQuerySchema.safeParse(await searchParams);
  if (!parsed.success) notFound();

  const requestContext = await createPageRequestContext();
  const result = demoModule.queries.getLuckyNumber.execute(
    parsed.data,
    toApplicationContext(requestContext),
  );
  return <LuckyNumberView model={presentLuckyNumber(result)} />;
}
