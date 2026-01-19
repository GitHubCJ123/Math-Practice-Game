import { getSupabase } from "../lib/api/db-pool.js";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5; // More restrictive rate limit for feedback
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function allowRequest(key: string) {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getClientKey(req: any): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: any, res: any) {
  console.log('[api/submit-feedback] Function invoked.');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { type, message } = req.body;

  // Validate type
  if (!type || (type !== 'feature' && type !== 'bug')) {
    return res.status(400).json({ message: 'Type must be either "feature" or "bug".' });
  }

  // Validate message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ message: 'Message is required.' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ message: 'Message must be 2000 characters or less.' });
  }

  // Rate limiting
  const clientKey = getClientKey(req);
  if (!allowRequest(clientKey)) {
    return res.status(429).json({ message: 'Too many requests. Please slow down.' });
  }

  try {
    const supabase = getSupabase();

    // Get user agent for additional context (helpful for debugging bug reports)
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const { error: insertError } = await supabase
      .from('feedback')
      .insert({
        type,
        message: message.trim(),
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    console.log(`[api/submit-feedback] Feedback submitted: type=${type}, message length=${message.length}`);
    return res.status(201).json({ message: 'Feedback submitted successfully!' });
  } catch (error: any) {
    console.error('[api/submit-feedback] Error handling request', error);
    return res.status(500).json({ message: 'Failed to submit feedback. Please try again later.', error: error.message });
  }
}
