export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validateServerConfiguration } = await import(
    './src/platform/config/validate-server-config'
  );
  validateServerConfiguration();
}
