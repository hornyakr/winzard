import type { Route } from 'next';

export type LuckyNumberNavigationItemViewModel = Readonly<{
  id: 'refresh' | 'range' | 'api';
  label: string;
  href: Route;
  delivery: 'page' | 'api';
}>;

export type LuckyNumberViewModel = Readonly<{
  eyebrow: string;
  heading: string;
  rangeLabel: string;
  navigationLabel: string;
  navigation: readonly LuckyNumberNavigationItemViewModel[];
}>;
