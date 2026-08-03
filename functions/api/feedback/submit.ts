import { verifyJWT } from '../../../src/auth';
import { getJwtSecret } from '../../../src/env';

interface Env { DB: D1Database; JWT_SECRET: string; GITHUB_TOKEN: string; }

const TYPE_LABELS: Record<string, string> = {
  suggestion: '建议',
  praise: '表扬',
  bug: '问题',
};

// Simple in-isolate rate limit for guest feedback (best-effort on CF)
const guestHits = new Map<string, { count: number; resetAt: number }>();

function rateLimitGuest(ip: string, limit = 8, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const row = guestHits.get(ip);
  if (!row || now > row.resetAt) {
    guestHits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Optional auth (route is public so guests can report bugs)
  let authed: { userId?: number; id?: number; username?: string } | undefined =
    (context.data as any)?.user;
  if (!authed) {
    const authHeader = context.request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const payload = await verifyJWT(authHeader.slice(7), getJwtSecret(context.env));
      if (payload) authed = payload as any;
    }
  }

  const body = await context.request.json() as {
    type: string;
    content: string;
    context?: { level?: string; year?: number; question?: number; page?: string };
  };

  if (!body.content?.trim()) {
    return new Response(JSON.stringify({ error: '请输入内容' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const type = ['suggestion', 'praise', 'bug'].includes(body.type) ? body.type : 'suggestion';
  const content = body.content.trim().slice(0, 2000);
  const now = new Date().toISOString();

  // Guests: only allow bug reports, with rate limit
  const userId = authed?.userId ?? authed?.id;
  const username = authed?.username;
  if (!userId || !username) {
    if (type !== 'bug') {
      return new Response(JSON.stringify({ error: '游客仅可提交问题报错，建议/表扬请先登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const ip = context.request.headers.get('CF-Connecting-IP')
      || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    if (!rateLimitGuest(ip)) {
      return new Response(JSON.stringify({ error: '提交过于频繁，请稍后再试' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const saveUserId = userId || 0;
  const saveUsername = username || 'guest';

  // Optional context appended for bug reports from quiz page
  let fullContent = content;
  if (body.context && typeof body.context === 'object') {
    const bits: string[] = [];
    if (body.context.page) bits.push(`page=${body.context.page}`);
    if (body.context.level) bits.push(`level=${body.context.level}`);
    if (body.context.year != null) bits.push(`year=${body.context.year}`);
    if (body.context.question != null) bits.push(`q=${body.context.question}`);
    if (bits.length) fullContent = `${content}\n\n[context] ${bits.join(' ')}`;
  }

  // Save to D1
  await context.env.DB.prepare(
    'INSERT INTO feedback (user_id, username, type, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(saveUserId, saveUsername, type, fullContent, now).run();

  // Create GitHub Issue (non-blocking)
  if (context.env.GITHUB_TOKEN) {
    const label = TYPE_LABELS[type] || type;
    const title = `[${label}] ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`;
    const issueBody = [
      `**类型**: ${label}`,
      `**用户**: ${saveUsername}${saveUserId ? ` (#${saveUserId})` : ' (游客)'}`,
      `**时间**: ${now.slice(0, 16).replace('T', ' ')}`,
      '',
      '---',
      '',
      fullContent,
    ].join('\n');

    try {
      await fetch('https://api.github.com/repos/cswanghan/kangaroo-levelb/issues', {
        method: 'POST',
        headers: {
          'Authorization': `token ${context.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'kangaroo-feedback',
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: ['feedback'],
        }),
      });
    } catch {
      // GitHub issue creation is best-effort, don't fail the request
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
