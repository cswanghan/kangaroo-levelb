interface Env { DB: D1Database; JWT_SECRET: string; }

import { hasUsersEmailColumn } from '../../../src/db/users';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const status = url.searchParams.get('status') || 'pending';
    const emailEnabled = await hasUsersEmailColumn(context.env.DB);

    const users = await context.env.DB.prepare(
      emailEnabled
        ? 'SELECT id, username, email, phone, role, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC'
        : "SELECT id, username, NULL AS email, phone, role, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC"
    ).bind(status).all();

    return new Response(JSON.stringify({ users: users.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
