interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = (context as any).user;
    const userId = user.userId;

    // 1. Overall stats
    const overviewResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as totalQuizzes,
              ROUND(AVG(score), 1) as avgScore,
              SUM(correct) as totalCorrect,
              SUM(total) as totalQuestions,
              MAX(score) as bestScore
       FROM quiz_sessions WHERE user_id = ?`
    ).bind(userId).first();

    const overview = {
      totalQuizzes: overviewResult?.totalQuizzes ?? 0,
      avgScore: overviewResult?.avgScore ?? 0,
      totalCorrect: overviewResult?.totalCorrect ?? 0,
      totalQuestions: overviewResult?.totalQuestions ?? 0,
      bestScore: overviewResult?.bestScore ?? 0,
    };

    // 2. By difficulty tier
    // Determine tier by question number + total questions in that session
    // 24-question papers: Q1-8 = 3pts, Q9-16 = 4pts, Q17-24 = 5pts
    // 30-question papers: Q1-10 = 3pts, Q11-20 = 4pts, Q21-30 = 5pts
    const difficultyResult = await context.env.DB.prepare(
      `SELECT
         CASE
           WHEN s.total = 24 AND a.question <= 8 THEN '3pts'
           WHEN s.total = 24 AND a.question <= 16 THEN '4pts'
           WHEN s.total = 24 AND a.question <= 24 THEN '5pts'
           WHEN s.total = 30 AND a.question <= 10 THEN '3pts'
           WHEN s.total = 30 AND a.question <= 20 THEN '4pts'
           WHEN s.total = 30 AND a.question <= 30 THEN '5pts'
           ELSE 'unknown'
         END as tier,
         COUNT(*) as total,
         SUM(CASE WHEN a.is_right = 1 THEN 1 ELSE 0 END) as correct
       FROM quiz_answers a
       JOIN quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = ?
       GROUP BY tier
       ORDER BY tier`
    ).bind(userId).all();

    const byDifficulty = (difficultyResult.results || [])
      .filter((r: any) => r.tier !== 'unknown')
      .map((r: any) => ({
        tier: r.tier,
        total: r.total,
        correct: r.correct,
        rate: r.total > 0 ? Math.round((r.correct / r.total) * 10000) / 10000 : 0,
      }));

    // 3. Trend data: last 50 sessions
    const trendResult = await context.env.DB.prepare(
      `SELECT level, year, score, total, correct, created_at
       FROM quiz_sessions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    ).bind(userId).all();

    const trend = trendResult.results || [];

    // 4. By level stats
    const byLevelResult = await context.env.DB.prepare(
      `SELECT level,
              COUNT(*) as quizzes,
              ROUND(AVG(score), 1) as avgScore,
              ROUND(AVG(CAST(correct AS REAL) / total), 4) as avgCorrectRate
       FROM quiz_sessions
       WHERE user_id = ?
       GROUP BY level
       ORDER BY level`
    ).bind(userId).all();

    const byLevel = (byLevelResult.results || []).map((r: any) => ({
      level: r.level,
      quizzes: r.quizzes,
      avgScore: r.avgScore,
      avgCorrectRate: r.avgCorrectRate,
    }));

    // 5. Wrong answer patterns: most frequently wrong questions
    const wrongResult = await context.env.DB.prepare(
      `SELECT a.question, COUNT(*) as wrongCount
       FROM quiz_answers a
       WHERE a.session_id IN (SELECT id FROM quiz_sessions WHERE user_id = ?)
         AND a.is_right = 0
       GROUP BY a.question
       ORDER BY wrongCount DESC
       LIMIT 10`
    ).bind(userId).all();

    const frequentWrong = (wrongResult.results || []).map((r: any) => ({
      question: r.question,
      wrongCount: r.wrongCount,
    }));

    return new Response(JSON.stringify({ overview, byDifficulty, trend, byLevel, frequentWrong }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error', stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
