import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';

type LuckyNumberViewProps = Readonly<{
  result: LuckyNumberDto;
}>;

export function LuckyNumberView({ result }: LuckyNumberViewProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">
          Winzard példaoldal
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          A szerencseszámod: {result.value}
        </h1>
      </header>

      <p className="text-zinc-300">
        A szám a {result.minimum}–{result.maximum} tartományból származik.
      </p>

      <nav aria-label="Szerencseszám műveletek" className="flex flex-wrap gap-4">
        <a className="underline" href="/lucky/number">
          Másik szám kérése
        </a>
        <a className="underline" href="/api/lucky/number">
          JSON-válasz megnyitása
        </a>
      </nav>
    </main>
  );
}
