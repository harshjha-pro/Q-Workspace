export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Clearly-marked demo reference such as DEMO-7KQ2M. */
export const demoRef = (prefix = 'DEMO') => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

export const nowIso = () => new Date().toISOString();
