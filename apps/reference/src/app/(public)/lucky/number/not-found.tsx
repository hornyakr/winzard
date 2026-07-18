import Link from 'next/link';

import { luckyNumberRoutes } from '@/modules/demo/lucky-number/presentation/lucky-number.routes';

export default function LuckyNumberNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">Érvénytelen szerencseszám-tartomány.</h1>
      <p>A minimum, maximum vagy a tartomány mérete nem felel meg a szerződésnek.</p>
      <Link className="underline" href={luckyNumberRoutes.index()}>
        Vissza az alapértelmezett tartományhoz
      </Link>
    </main>
  );
}
