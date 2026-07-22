import { KernelConfigurationError } from './kernel-config.errors';

export const supportedLocales = Object.freeze(['hu', 'en'] as const);
export type SupportedLocale = (typeof supportedLocales)[number];

export type LocaleConfiguration = Readonly<{
  defaultLocale: SupportedLocale;
  enabledLocales: readonly SupportedLocale[];
}>;

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(value);
}

export function createLocaleConfiguration(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): LocaleConfiguration {
  const enabledInput = input.ENABLED_LOCALES ?? supportedLocales.join(',');
  const enabled = [...new Set(
    enabledInput.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  )];
  if (enabled.length === 0 || enabled.some((value) => !isSupportedLocale(value))) {
    throw new KernelConfigurationError(
      'KERNEL_LOCALE_UNSUPPORTED',
      `ENABLED_LOCALES csak a támogatott locale-okat tartalmazhatja: ${supportedLocales.join(', ')}.`,
    );
  }
  const defaultLocaleInput = (input.DEFAULT_LOCALE ?? enabled[0] ?? '').trim().toLowerCase();
  if (!isSupportedLocale(defaultLocaleInput)) {
    throw new KernelConfigurationError(
      'KERNEL_LOCALE_UNSUPPORTED',
      `DEFAULT_LOCALE nem támogatott: ${defaultLocaleInput}.`,
    );
  }
  if (!enabled.includes(defaultLocaleInput)) {
    throw new KernelConfigurationError(
      'KERNEL_LOCALE_DEFAULT_NOT_ENABLED',
      'A default locale szerepeljen az enabled locale-listában.',
    );
  }
  return Object.freeze({
    defaultLocale: defaultLocaleInput,
    enabledLocales: Object.freeze(enabled as SupportedLocale[]),
  });
}

type LanguagePreference = Readonly<{
  locale: SupportedLocale;
  quality: number;
  index: number;
}>;

export function resolveAcceptLanguage(
  header: string | null,
  configuration: LocaleConfiguration,
): SupportedLocale {
  if (!header) return configuration.defaultLocale;
  const preferences: LanguagePreference[] = [];
  for (const [index, part] of header.split(',').entries()) {
    const [rawTag = '', ...parameters] = part.trim().split(';');
    const tag = rawTag.trim().toLowerCase();
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u.exec(parameter.trim());
      if (match) quality = Number(match[1]);
    }
    if (quality <= 0) continue;
    const candidate = configuration.enabledLocales.find((locale) =>
      tag === locale || tag.startsWith(`${locale}-`));
    if (candidate) preferences.push({ locale: candidate, quality, index });
  }
  preferences.sort((left, right) =>
    right.quality - left.quality || left.index - right.index);
  return preferences[0]?.locale ?? configuration.defaultLocale;
}
