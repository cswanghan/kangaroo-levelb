import { verifyPassword, signJWT } from '../../../src/auth';
import { getJwtSecret } from '../../../src/env';

interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json<{ username?: string; password?: string; account?: string }>();
  const account = String(body.account || body.username || '').trim();
  const password = body.password || '';

  if (!account || !password) {
    return json({ error: '请输入用户名/邮箱和密码' }, 400);
  }

  // Accept username OR email (common failure mode: users type email into username field)
  const accountLower = account.toLowerCase();
  let user = await context.env.DB.prepare(
    'SELECT id, username, password, role, status, email FROM users WHERE lower(username) = ?'
  ).bind(accountLower).first<any>();

  if (!user && account.includes('@')) {
    user = await context.env.DB.prepare(
      'SELECT id, username, password, role, status, email FROM users WHERE email IS NOT NULL AND lower(email) = ?'
    ).bind(accountLower).first<any>();
  }

  if (!user) {
    return json({
      error: '账号或密码错误',
      hint: '可尝试用户名、注册邮箱，或使用下方 Google 登录',
      code: 'invalid_credentials',
    }, 401);
  }

  if (user.status === 'pending') {
    return json({ error: '账号待审核，请耐心等待', code: 'pending' }, 403);
  }

  if (user.status === 'rejected') {
    return json({ error: '账号审核未通过', code: 'rejected' }, 403);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return json({
      error: '账号或密码错误',
      hint: '可尝试用户名、注册邮箱，或使用下方 Google 登录',
      code: 'invalid_credentials',
    }, 401);
  }

  const token = await signJWT(
    { userId: user.id, username: user.username, role: user.role },
    getJwtSecret(context.env)
  );

  return json({ token, user: { id: user.id, username: user.username, role: user.role } });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
