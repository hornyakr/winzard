import Link from 'next/link';

import { luckyNumberRoutes } from '@/modules/demo/lucky-number/presentation/lucky-number.routes';

export default function Home() {
  return (
    <main className="min-h-screen px-8 py-24">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header>
          <p className="font-mono text-sm">WINZARD REFERENCE APP</p>
          <h1 className="mt-6 text-5xl font-semibold">A capability-független referencia aktív.</h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-300">
            A Next.js delivery adapter; az application művelet, a port, az infrastruktúra-adapter és a
            composition root külön rétegekben marad. A routing példa adatbázis és autentikációs runtime nélkül fut.
          </p>
        </header>

        <section aria-labelledby="examples" className="space-y-4">
          <h2 id="examples" className="text-xl font-medium">
            Futtatható vertikális szeletek
          </h2>
          <div className="flex flex-wrap gap-4">
            <Link className="rounded-full bg-zinc-100 px-5 py-3 font-medium text-zinc-950" href={luckyNumberRoutes.index()}>
              Szerencseszám-oldal
            </Link>
            <Link className="rounded-full border border-zinc-700 px-5 py-3 font-medium" href={luckyNumberRoutes.range(10, 20)}>
              Dinamikus route
            </Link>
            <a className="rounded-full border border-zinc-700 px-5 py-3 font-medium" href={luckyNumberRoutes.api()}>
              JSON-végpont
            </a>
            <a className="rounded-full border border-zinc-700 px-5 py-3 font-medium" href="/random-number">
              Deprecated alias
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
