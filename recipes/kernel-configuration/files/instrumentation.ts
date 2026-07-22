export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validateKernelConfiguration } = await import(
    './src/platform/kernel-config/validate-kernel-config.server'
  );
  await validateKernelConfiguration();
}
