/**
 * The database connection, as typed into a hosting dashboard (D-99). Either separate settings
 * (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, optional DB_PORT), which win when present because they need no URL
 * encoding, or one DATABASE_URL, which often carries spaces, quotes or a leading "DATABASE_URL=".
 * The build and the app both read it through here, so they always agree.
 */
export const cleanDatabaseUrl = (value: string): string =>
  value.trim().replace(/^DATABASE_URL\s*=\s*/i, "").replace(/^["']|["']$/g, "").trim();

export function resolveDatabaseUrl(e: Record<string, string | undefined> = process.env): string | undefined {
  const part = (k: string) => (e[k] ?? "").trim();
  if (part("DB_HOST") && part("DB_USER") && part("DB_NAME")) {
    const host = part("DB_HOST").replace(/^[a-z]+:\/\//i, "").replace(/[/:].*$/, "");
    const enc = encodeURIComponent;
    return `mysql://${enc(part("DB_USER"))}:${enc(e.DB_PASSWORD ?? "")}@${host}:${part("DB_PORT") || "3306"}/${enc(part("DB_NAME"))}`;
  }
  return e.DATABASE_URL === undefined ? undefined : cleanDatabaseUrl(e.DATABASE_URL);
}
