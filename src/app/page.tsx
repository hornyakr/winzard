import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen px-8 py-24">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header>
          <p className="font-mono text-sm">WINZARD 0.1.0</p>
          <h1 className="mt-6 text-5xl font-semibold">A setup baseline aktív.</h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-300">
            A Next.js delivery adapter; az üzleti architektúra a moduláris domain- és application
            rétegekben marad.
          </p>
        </header>

        <section aria-labelledby="examples" className="space-y-4">
          <h2 id="examples" className="text-xl font-medium">
            Futtatható vertikális szeletek
          </h2>
          <div className="flex flex-wrap gap-4">
            <Link className="rounded-full bg-zinc-100 px-5 py-3 font-medium text-zinc-950" href="/lucky/number">
              Szerencseszám-oldal
            </Link>
            <a className="rounded-full border border-zinc-700 px-5 py-3 font-medium" href="/api/lucky/number">
              JSON-végpont
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
