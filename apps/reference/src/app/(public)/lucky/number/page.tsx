import type { Metadata } from 'next';
import { connection } from 'next/server';

import { demoModule } from '@/composition/demo';
import { LuckyNumberView } from '@/modules/demo/lucky-number/index.server';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Szerencseszám',
  description: 'A Winzard első request-time renderelt példaoldala.',
};

export default async function LuckyNumberPage() {
  await connection();

  const result = demoModule.queries.getLuckyNumber.execute();

  return <LuckyNumberView result={result} />;
}
