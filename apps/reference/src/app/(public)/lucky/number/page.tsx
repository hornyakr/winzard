import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { demoModule } from '@/composition/demo';
import { LuckyNumberView, presentLuckyNumber } from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRangeQuerySchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';

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

  const result = demoModule.queries.getLuckyNumber.execute(parsed.data);
  return <LuckyNumberView model={presentLuckyNumber(result)} />;
}
