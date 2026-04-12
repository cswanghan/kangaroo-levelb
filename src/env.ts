const DEFAULT_JWT_SECRET = 'kangaroo-local-dev-secret';

export function getJwtSecret(env: { JWT_SECRET?: string }): string {
  return env.JWT_SECRET || DEFAULT_JWT_SECRET;
}
