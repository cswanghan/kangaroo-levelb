import { getRequestUser } from '../../../src/request-auth';

interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const jwtUser = await getRequestUser(
      context.request,
      context.env,
      (context as any).user || context.data?.user || null
    );

    if (!jwtUser?.userId) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify user still exists and is active in DB
    const dbUser = await context.env.DB.prepare(
      'SELECT id, username, role, status FROM users WHERE id = ?'
    ).bind(jwtUser.userId).first<any>();

    if (!dbUser || dbUser.status === 'pending' || dbUser.status === 'rejected') {
      return new Response(JSON.stringify({ error: '账号不可用' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user: { id: dbUser.id, username: dbUser.username, role: dbUser.role } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
