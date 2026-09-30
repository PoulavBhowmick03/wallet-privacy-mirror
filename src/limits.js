import { createHash } from 'node:crypto';

// Shared counters for paid public requests, stored in Upstash Redis over its REST API.
// Serverless instances do not share memory, so only a shared store can enforce a daily cap.
// Every failure is reported as unavailable: callers must not make the paid request then.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const storeConfigured = Boolean(url && token);
export const AI_LIMITS = { perClientPerDay: Number(process.env.AI_PER_CLIENT_DAILY || 3), perDay: Number(process.env.AI_DAILY_CAP || 25) };
export const hash = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 32);

async function pipeline(commands, fetcher = fetch) {
  const response = await fetcher(`${url}/pipeline`, { method: 'POST', signal: AbortSignal.timeout(4000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Rate-limit store returned ${response.status}.`);
  const results = await response.json();
  if (!Array.isArray(results) || results.some(r => r.error)) throw new Error('Rate-limit store rejected the request.');
  return results.map(r => r.result);
}

// Counts one attempt for this client and for the whole site. Attempts count, not successes.
export async function takeAIRun(client, fetcher) {
  const day = new Date().toISOString().slice(0, 10), clientKey = `ai:client:${hash(client)}:${day}`, siteKey = `ai:site:${day}`;
  const [, clientCount, , siteCount] = await pipeline([['SET', clientKey, '0', 'EX', '90000', 'NX'], ['INCR', clientKey], ['SET', siteKey, '0', 'EX', '90000', 'NX'], ['INCR', siteKey]], fetcher);
  if (siteCount > AI_LIMITS.perDay) return `This site has reached today's limit of ${AI_LIMITS.perDay} live model comparisons. Try again tomorrow, or run the project locally with your own key.`;
  if (clientCount > AI_LIMITS.perClientPerDay) return `You have used today's ${AI_LIMITS.perClientPerDay} live model comparisons. Try again tomorrow, or run the project locally with your own key.`;
  return null;
}
export async function cachedResult(key, fetcher) { const [value] = await pipeline([['GET', `ai:result:${key}`]], fetcher); return value ? JSON.parse(value) : null; }
export async function cacheResult(key, result, fetcher) { await pipeline([['SET', `ai:result:${key}`, JSON.stringify(result), 'EX', '86400']], fetcher); }
