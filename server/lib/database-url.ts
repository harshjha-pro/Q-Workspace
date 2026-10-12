/**
 * DATABASE_URL as typed into a hosting dashboard often carries spaces, quotes or a leading "DATABASE_URL=".
 * The build and the app both read it through this, so they always agree on the value (D-99).
 */
export const cleanDatabaseUrl = (value: string): string =>
  value.trim().replace(/^DATABASE_URL\s*=\s*/i, "").replace(/^["']|["']$/g, "").trim();
