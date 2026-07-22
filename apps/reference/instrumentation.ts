import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [configuration, kernel] = await Promise.all([
    import('./src/platform/config/validate-server-config'),
    import('./src/platform/kernel-config/validate-kernel-config.server'),
  ]);
  configuration.validateServerConfiguration();
  await kernel.validateKernelConfiguration();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { createRequestErrorReport, reportRequestError } = await import(
    './src/platform/observability/request-error-reporter.server'
  );
  await reportRequestError(createRequestErrorReport(error, request, context));
};
