import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { demoModule } from '@/composition/demo';
import {
  InvalidLuckyNumberRangeError,
  LuckyNumberView,
  presentLuckyNumber,
} from '@/modules/demo/lucky-number/index.server';
import { luckyNumberRangeParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Szerencseszám egyedi tartományból',
  description: 'Dinamikus route-paraméterekkel validált Winzard routing példa.',
};

type LuckyNumberRangePageProps = Readonly<{
  params: Promise<{ minimum: string; maximum: string }>;
}>;

export default async function LuckyNumberRangePage({ params }: LuckyNumberRangePageProps) {
  const parsed = luckyNumberRangeParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  await connection();

  const result = (() => {
    try {
      return demoModule.queries.getLuckyNumber.execute(parsed.data);
    } catch (error) {
      if (error instanceof InvalidLuckyNumberRangeError) notFound();
      throw error;
    }
  })();

  return <LuckyNumberView model={presentLuckyNumber(result)} />;
}
