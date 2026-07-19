'use client';

type LuckyNumberErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function LuckyNumberError({ error, reset }: LuckyNumberErrorProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">A szerencseszám most nem érhető el.</h1>
      <p>Próbáld meg újra. Hibahivatkozás: {error.digest ?? 'nincs'}</p>
      <button
        className="w-fit rounded-full bg-zinc-100 px-5 py-2 font-medium text-zinc-950"
        onClick={reset}
        type="button"
      >
        Újrapróbálás
      </button>
    </main>
  );
}
