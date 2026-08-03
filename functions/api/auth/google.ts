import { signJWT } from '../../../src/auth';
import { getJwtSecret } from '../../../src/env';
import { verifyGoogleIdToken, randomUsernameSuffix } from '../../../src/google';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  /** Comma-separated emails that should always have admin role after Google login */
  ADMIN_EMAILS?: string;
}

const GOOGLE_PASSWORD_PLACEHOLDER = '!google-oauth!';

function adminEmails(env: Env): Set<string> {
  const raw = env.ADMIN_EMAILS || 'cswanghan@gmail.com';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const clientId = context.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return json({ error: 'Google 登录未配置' }, 500);
  }

  let body: { credential?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const credential = body.credential;
  if (!credential) {
    return json({ error: '缺少 credential' }, 400);
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential, clientId);
  } catch (e: any) {
    return json({ error: 'Google 凭证校验失败: ' + (e.message || 'unknown') }, 401);
  }

  const db = context.env.DB;
  const email = String(payload.email || '').toLowerCase();
  const isAdminEmail = email && adminEmails(context.env).has(email);

  let user = await db.prepare(
    'SELECT id, username, role, status, email, google_sub FROM users WHERE google_sub = ?'
  ).bind(payload.sub).first<any>();

  let needsUsername = false;

  if (!user) {
    // Try linking by email
    user = await db.prepare(
      'SELECT id, username, role, status, email, google_sub FROM users WHERE email = ?'
    ).bind(payload.email).first<any>();

    if (user) {
      await db.prepare('UPDATE users SET google_sub = ? WHERE id = ?')
        .bind(payload.sub, user.id).run();
      user.google_sub = payload.sub;
    } else {
      // Auto-register — use placeholder username, force user to pick one
      let tempUsername = `google_${randomUsernameSuffix()}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const clash = await db.prepare('SELECT id FROM users WHERE username = ?')
          .bind(tempUsername).first();
        if (!clash) break;
        tempUsername = `google_${randomUsernameSuffix()}`;
      }

      const role = isAdminEmail ? 'admin' : 'user';
      const insert = await db.prepare(
        `INSERT INTO users (username, password, email, google_sub, status, role)
         VALUES (?, ?, ?, ?, 'approved', ?)`
      ).bind(tempUsername, GOOGLE_PASSWORD_PLACEHOLDER, payload.email, payload.sub, role).run();

      const newId = (insert.meta as any)?.last_row_id;
      if (!newId) return json({ error: '创建用户失败' }, 500);

      user = {
        id: newId,
        username: tempUsername,
        role,
        status: 'approved',
        email: payload.email,
        google_sub: payload.sub,
      };
      needsUsername = true;
    }
  }

  // Keep configured owner emails as admin (JWT role is taken from DB at login time)
  if (isAdminEmail && user.role !== 'admin') {
    await db.prepare(
      "UPDATE users SET role = 'admin', status = 'approved', updated_at = datetime('now') WHERE id = ?"
    ).bind(user.id).run();
    user.role = 'admin';
    user.status = 'approved';
  }

  if (user.status === 'pending') return json({ error: '账号待审核，请耐心等待' }, 403);
  if (user.status === 'rejected') return json({ error: '账号审核未通过' }, 403);

  const token = await signJWT(
    { userId: user.id, username: user.username, role: user.role },
    getJwtSecret(context.env)
  );

  return json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
    needsUsername,
  });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
