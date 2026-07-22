import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [configuration, kernel, composition, events, contracts] = await Promise.all([
    import('./src/platform/config/validate-server-config'),
    import('./src/platform/kernel-config/validate-kernel-config.server'),
    import('./src/platform/composition/validate-composition.server'),
    import('./src/platform/events/validate-events.server'),
    import('./src/platform/contracts/validate-contracts.server'),
  ]);
  configuration.validateServerConfiguration();
  await kernel.validateKernelConfiguration();
  await composition.validateComposition();
  await events.validateEventRegistry();
  contracts.validateContractRegistry();
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
