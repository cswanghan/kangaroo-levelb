import { verifyJWT } from './auth';
import { getJwtSecret } from './env';

export async function getRequestUser(
  request: Request,
  env: { JWT_SECRET?: string },
  contextUser?: { userId?: number; username?: string; role?: string } | null
) {
  if (contextUser?.userId) {
    return contextUser;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return verifyJWT(authHeader.slice(7), getJwtSecret(env));
}
