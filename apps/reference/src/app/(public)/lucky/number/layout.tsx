import type { ReactNode } from 'react';

type LuckyNumberLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function LuckyNumberLayout({ children }: LuckyNumberLayoutProps) {
  return (
    <section aria-label="Szerencseszám referencia">
      {children}
    </section>
  );
}
