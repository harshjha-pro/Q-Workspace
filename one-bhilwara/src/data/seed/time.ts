/** Seed timestamps are relative to the moment the demo is seeded, so the demo always looks current. */
export const NOW = () => Date.now();
const H = 3600_000;
export const ago = (hours: number) => new Date(NOW() - hours * H).toISOString();
export const ahead = (hours: number) => new Date(NOW() + hours * H).toISOString();
export const dayStr = (offsetDays: number) => {
  const d = new Date(NOW() + offsetDays * 24 * H);
  return d.toISOString().slice(0, 10);
};
