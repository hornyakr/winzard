export const kernelConfigurationErrorCodes = [
  'KERNEL_PROJECT_ROOT_MISSING',
  'KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY',
  'KERNEL_APPLICATION_ROOT_AMBIGUOUS',
  'KERNEL_PACKAGE_ROOT_MISMATCH',
  'KERNEL_WORKSPACE_MANIFEST_MISSING',
  'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
  'KERNEL_BUILD_ID_MISSING',
  'KERNEL_DEPLOYMENT_ID_MISSING',
  'KERNEL_DEPLOYMENT_ID_INCONSISTENT',
  'KERNEL_SOURCE_DATE_EPOCH_INVALID',
  'KERNEL_REPRODUCIBLE_BUILD_DRIFT',
  'KERNEL_CACHE_NAMESPACE_MISSING',
  'KERNEL_SHARED_CACHE_UNSAFE',
  'KERNEL_COMPOSITION_HASH_DRIFT',
  'KERNEL_DEBUG_EXPOSES_INTERNALS',
  'KERNEL_NODE_ENV_INVALID',
  'KERNEL_STAGE_INVALID',
  'KERNEL_ENVIRONMENT_STAGE_CONFLICT',
  'KERNEL_RUNTIME_MODE_AMBIGUOUS',
  'KERNEL_LOCALE_DEFAULT_NOT_ENABLED',
  'KERNEL_LOCALE_UNSUPPORTED',
  'KERNEL_ERROR_MAPPER_MISSING',
  'KERNEL_METHOD_OVERRIDE_ENABLED_GLOBALLY',
  'KERNEL_METHOD_OVERRIDE_UNSAFE',
  'KERNEL_GLOBAL_SECRET_USED',
  'KERNEL_SECRET_PLACEHOLDER',
  'KERNEL_SECRET_ROTATION_INVALID',
  'KERNEL_TRUSTED_HEADER_UNSAFE',
  'KERNEL_TRUSTED_PROXY_BOUNDARY_MISSING',
  'KERNEL_TRUSTED_PROXY_TOO_BROAD',
  'KERNEL_TRUSTED_HOST_MISSING',
  'KERNEL_HOST_HEADER_INJECTION',
  'KERNEL_X_SENDFILE_UNSAFE',
  'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION',
  'KERNEL_CHARSET_UNSUPPORTED',
  'KERNEL_LOG_SECRET_LEAK',
  'KERNEL_CAPABILITY_METADATA_INVALID',
  'KERNEL_EDGE_NODE_IMPORT',
] as const;

export type KernelConfigurationErrorCode =
  (typeof kernelConfigurationErrorCodes)[number];

export class KernelConfigurationError extends Error {
  readonly code: KernelConfigurationErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(
    code: KernelConfigurationErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'KernelConfigurationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function isKernelConfigurationError(
  value: unknown,
): value is KernelConfigurationError {
  return value instanceof KernelConfigurationError;
}
