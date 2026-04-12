export async function hasUsersEmailColumn(db: D1Database): Promise<boolean> {
  const columns = await db.prepare("PRAGMA table_info(users)").all<any>();
  return (columns.results || []).some((column: any) => column.name === 'email');
}
