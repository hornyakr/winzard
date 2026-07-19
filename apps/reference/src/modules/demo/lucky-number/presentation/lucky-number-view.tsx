import Image from 'next/image';
import Link from 'next/link';

import luckyNumberOrbit from './assets/lucky-number-orbit.svg';
import { LuckyNumberForm } from './lucky-number-form';
import type { LuckyNumberViewModel } from './lucky-number.view-model';

type LuckyNumberViewProps = Readonly<{
  model: LuckyNumberViewModel;
}>;

export function LuckyNumberView({ model }: LuckyNumberViewProps) {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-6 py-16 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-8">
        <header className="space-y-3">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">
            {model.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            {model.heading}
          </h1>
        </header>

        <p className="text-zinc-300">
          {model.rangeLabel}
        </p>

        <LuckyNumberForm />

        <nav aria-label={model.navigationLabel} className="flex flex-wrap gap-4">
          {model.navigation.map((action) => action.delivery === 'page' ? (
            <Link className="underline" href={action.href} key={action.id}>
              {action.label}
            </Link>
          ) : (
            <a className="underline" href={action.href} key={action.id}>
              {action.label}
            </a>
          ))}
        </nav>
      </div>

      <Image
        alt="Geometrikus pályák a szerencseszám körül"
        className="mx-auto h-auto w-full max-w-xs"
        priority
        src={luckyNumberOrbit}
      />
    </main>
  );
}
