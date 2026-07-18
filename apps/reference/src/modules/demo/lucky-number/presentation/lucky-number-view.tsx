import Link from 'next/link';

import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';
import { LuckyNumberForm } from './lucky-number-form';
import { luckyNumberRoutes } from './lucky-number.routes';

type LuckyNumberViewProps = Readonly<{
  result: LuckyNumberDto;
}>;

export function LuckyNumberView({ result }: LuckyNumberViewProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">
          Winzard routing referencia
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          A szerencseszámod: {result.value}
        </h1>
      </header>

      <p className="text-zinc-300">
        A szám a {result.minimum}–{result.maximum} tartományból származik.
      </p>

      <LuckyNumberForm />

      <nav aria-label="Szerencseszám műveletek" className="flex flex-wrap gap-4">
        <Link className="underline" href={luckyNumberRoutes.index()}>
          Másik szám kérése
        </Link>
        <Link className="underline" href={luckyNumberRoutes.range(10, 20)}>
          Dinamikus 10–20 route
        </Link>
        <a className="underline" href={luckyNumberRoutes.api()}>
          JSON-válasz megnyitása
        </a>
      </nav>
    </main>
  );
}
