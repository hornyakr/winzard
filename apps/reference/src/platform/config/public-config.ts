import 'server-only';

import { z } from 'zod';

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).max(128),
});

export type PublicAppConfig = Readonly<{
  appName: string;
}>;

export function readBuildPublicEnvironmentInput(): Readonly<{
  NEXT_PUBLIC_APP_NAME: string | undefined;
}> {
  return {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  };
}

export function createPublicAppConfig(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = readBuildPublicEnvironmentInput(),
): PublicAppConfig {
  const environment = publicEnvironmentSchema.parse({
    NEXT_PUBLIC_APP_NAME: input.NEXT_PUBLIC_APP_NAME,
  });
  return Object.freeze({ appName: environment.NEXT_PUBLIC_APP_NAME });
}
