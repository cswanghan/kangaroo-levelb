import { signJWT } from '../../../src/auth';
import { getJwtSecret } from '../../../src/env';
import { getRequestUser } from '../../../src/request-auth';

interface Env { DB: D1Database; JWT_SECRET: string; }

const USERNAME_RE = /^[A-Za-z0-9_\-]+$/;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const jwtUser = await getRequestUser(
    context.request,
    context.env,
    (context as any).user || context.data?.user || null
  );

  if (!jwtUser?.userId) {
    return json({ error: '未登录' }, 401);
  }

  let body: { username?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const username = (body.username || '').trim();
  if (!username) return json({ error: '用户名不能为空' }, 400);
  if (username.length < 3 || username.length > 20) {
    return json({ error: '用户名长度 3-20 字符' }, 400);
  }
  if (!USERNAME_RE.test(username)) {
    return json({ error: '用户名只能包含字母、数字、下划线、横线' }, 400);
  }

  const db = context.env.DB;

  const me = await db.prepare(
    'SELECT id, username, role, status, google_sub FROM users WHERE id = ?'
  ).bind(jwtUser.userId).first<any>();

  if (!me) return json({ error: '用户不存在' }, 404);
  if (me.status === 'pending') return json({ error: '账号待审核' }, 403);
  if (me.status === 'rejected') return json({ error: '账号审核未通过' }, 403);

  // Only allow rename if this is a google-auto-registered account with a google_xxxx placeholder username
  if (!me.google_sub || !/^google_[a-z0-9]+$/.test(me.username)) {
    return json({ error: '当前账号无需补全用户名' }, 400);
  }

  const clash = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
    .bind(username, me.id).first();
  if (clash) return json({ error: '用户名已被占用' }, 409);

  await db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(username, me.id).run();

  const token = await signJWT(
    { userId: me.id, username, role: me.role },
    getJwtSecret(context.env)
  );

  return json({ token, user: { id: me.id, username, role: me.role } });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
