import type { ReactNode } from 'react';

type LuckyNumberTemplateProps = Readonly<{
  children: ReactNode;
}>;

export default function LuckyNumberTemplate({ children }: LuckyNumberTemplateProps) {
  return <div data-navigation-boundary="lucky-number">{children}</div>;
}
