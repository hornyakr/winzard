import { KernelConfigurationError } from './kernel-config.errors';

export const allowedLegacyOverrides = ['PUT', 'PATCH', 'DELETE'] as const;
export type AllowedLegacyOverride = (typeof allowedLegacyOverrides)[number];

export type MethodOverridePolicy = Readonly<{
  enabled: boolean;
  allowedMethods: readonly AllowedLegacyOverride[];
}>;

export const disabledMethodOverridePolicy: MethodOverridePolicy = Object.freeze({
  enabled: false,
  allowedMethods: Object.freeze([]),
});

export function resolveLegacyMethod(
  request: Request,
  policy: MethodOverridePolicy = disabledMethodOverridePolicy,
): 'POST' | AllowedLegacyOverride {
  const raw = request.headers.get('x-http-method-override');
  if (!policy.enabled) {
    if (raw) {
      throw new KernelConfigurationError(
        'KERNEL_METHOD_OVERRIDE_ENABLED_GLOBALLY',
        'A HTTP method override alapértelmezetten tiltott.',
      );
    }
    return 'POST';
  }
  if (request.method !== 'POST') {
    throw new KernelConfigurationError(
      'KERNEL_METHOD_OVERRIDE_UNSAFE',
      'Method override kizárólag eredeti POST requesten használható.',
    );
  }
  if (!raw) return 'POST';
  if (raw.includes(',')) {
    throw new KernelConfigurationError(
      'KERNEL_METHOD_OVERRIDE_UNSAFE',
      'Több method override érték nem engedélyezett.',
    );
  }
  const method = raw.trim().toUpperCase();
  if (!policy.allowedMethods.includes(method as AllowedLegacyOverride)) {
    throw new KernelConfigurationError(
      'KERNEL_METHOD_OVERRIDE_UNSAFE',
      `Nem engedélyezett method override: ${method}.`,
    );
  }
  return method as AllowedLegacyOverride;
}
