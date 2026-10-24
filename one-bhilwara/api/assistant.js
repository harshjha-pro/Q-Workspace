/**
 * One Bhilwara AI assistant — server-side endpoint (Vercel Node function: POST /api/assistant).
 *
 * The browser never sees the API key. Set ANTHROPIC_API_KEY in the hosting provider's
 * environment, then set VITE_AI_ENDPOINT=/api/assistant for the frontend build.
 * Without these, the app uses its rule-based demo assistant.
 *
 * Request:  { messages: [{ role: 'user'|'assistant', content: string }], locality?: string }
 * Response: { text: string, actions?: [{ label, link }], sources?: [{ label, link }] }
 *
 * Production TODO: add per-user/IP rate limiting and authentication before going live.
 */
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment

const SYSTEM = `You are the One Bhilwara assistant for residents of Bhilwara, Rajasthan, India.
Help people find local services, jobs, property, schemes, events and app sections.
Rules:
- You have no live data access. Never claim to have searched live listings, prices or news; suggest the relevant app section instead.
- App sections: /services, /jobs, /property, /property/students, /marketplace, /government, /government/eligibility, /education, /healthcare, /agriculture, /weddings, /events, /transport, /finance, /professionals, /businesses, /offers, /news, /alerts, /polls.
- For emergencies tell the user to call 112 (or 108 for ambulance) first.
- For medical, legal, financial and crop-protection questions, give general information only and recommend a qualified professional. Never prescribe medicines, pesticides or doses.
- One Bhilwara is not a government authority; point to official portals for schemes.
- Answer in the user's language (Hindi or English), briefly and practically.`;

const MAX_TURNS = 12;
const MAX_CHARS = 2000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Send at least one user message.' });
  }
  const locality = typeof body?.locality === 'string' ? body.locality.slice(0, 60) : 'Bhilwara';

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${SYSTEM}\nThe user's selected locality is ${locality}.`,
      messages
    });
    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ text: 'Sorry, I can’t help with that request. Try the Help page or contact support.', actions: [{ label: 'Help', link: '/help' }] });
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return res.status(200).json({ text: text || 'I couldn’t find an answer. Try searching the app.', actions: [{ label: 'Search the app', link: '/search' }] });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The assistant is busy. Please try again shortly.' });
    if (err instanceof Anthropic.APIError) {
      console.error('Assistant API error', err.status, err.message);
      return res.status(502).json({ error: 'The assistant is unavailable right now.' });
    }
    console.error('Assistant error', err);
    return res.status(500).json({ error: 'Unexpected error.' });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
