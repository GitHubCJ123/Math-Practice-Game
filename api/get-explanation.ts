import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { ExplanationRequestSchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type ExplainPayload = {
  num1: number;
  num2?: number;
  operation: string;
  answer: string | number;
};

const DEFAULT_FALLBACK = (answer: string | number) =>
  `The correct answer is ${answer}. Keep trying!`;

/**
 * Persona + strict output contract for the coach. Lives in the system message
 * so the per-problem user message stays tiny. The formatting rules are kept in
 * lock-step with what <ExplanationText> can render: bold headers on their own
 * line, "- " bullets, and plain unicode math (×, ÷, √, ²) — never LaTeX.
 */
const SYSTEM_PROMPT = `You are "Coach", a world-class mental-math coach living inside a fast-paced math game. A student just missed a question while racing the clock. Your job is to make the idea genuinely click, walk through the actual numbers, and hand them a faster way to nail it next time. Be thorough but tight — a focused mini-lesson, not a wall of text.

Reply in THIS EXACT structure, using all four sections:

**The idea**
- One or two bullets explaining the core concept in plain, friendly language so the student understands *why* the method works, not just the steps.

**Step by step**
- Walk through THIS exact problem in 2–4 short bullets, showing the real numbers at each step (e.g., "Split 7 × 8 into 7 × 4 = 28, then double it: 28 × 2 = 56"). End on the correct answer.

**Speed trick**
- One or two bullets with a concrete mental-math shortcut for this *kind* of problem, so they can do it faster next time.

**Try this next**
- One bullet: a tiny tip, pattern, or similar quick example to lock it in.

Then add ONE short, encouraging closing sentence on its own line (no header, no bullet).

Hard rules:
- Aim for roughly 110–170 words total. Every bullet is a single line; keep them punchy.
- Use ONLY this Markdown: **bold** for the four headers exactly as written above, and "- " for bullet lines. You may use **bold** inside a bullet to spotlight a key number or word.
- Write math with plain symbols a student reads instantly: ×, ÷, √, ², =, and digits. Always show the worked numbers (e.g., "7 × 8 = 56").
- NEVER use LaTeX, backslashes, \\frac, \\sqrt, \\(...\\), $...$, numbered lists, headings other than the four above, tables, or code blocks.
- Be warm, upbeat, and respectful — assume the student is smart and just needs a clearer path. No shaming, no filler, no restating the question as a question.
- The correct answer is provided to you; treat it as ground truth and build every step toward it.`;

type ProblemFraming = { problem: string; focus: string };

/**
 * Frames a single missed question for the coach: the exact problem to solve and
 * a short hint about which method is worth teaching. Returns null when the
 * problem can't be framed, so the caller can skip the AI call and fall back.
 */
function describeProblem({ num1, num2, operation, answer }: ExplainPayload): ProblemFraming | null {
  switch (operation) {
    case "multiplication":
      return { problem: `${num1} × ${num2}`, focus: "a times-table fact — offer a place-value, doubling/halving, or round-and-adjust shortcut" };
    case "division":
      return { problem: `${num1} ÷ ${num2}`, focus: "division — connect it to the matching multiplication fact and find the missing factor fast" };
    case "squares":
      return { problem: `${num1}²`, focus: "squaring a number — show a fast method (e.g., the trick for numbers ending in 5, or (a + b)²)" };
    case "square-roots":
      return { problem: `√${num1}`, focus: "a perfect-square root — show how to recognize the square and recall the root instantly" };
    case "fraction-to-decimal":
      return { problem: `${num1}/${num2} written as a decimal`, focus: "long division (numerator ÷ denominator), rounding repeating decimals to three places" };
    case "decimal-to-fraction":
      return { problem: `${num1} written as a fraction in simplest form`, focus: "writing it over its place value (e.g., 0.75 = 75/100), then simplifying with the greatest common divisor" };
    case "fraction-to-percent":
      return { problem: `${num1}/${num2} written as a percent`, focus: "dividing to a decimal then × 100, rounding repeating values to one decimal place (e.g., 1/3 ≈ 33.3%)" };
    case "percent-to-fraction":
      return { problem: `${num1}% written as a fraction in simplest form`, focus: "writing the percent over 100 (or 1000 for one decimal place), then simplifying with the greatest common divisor" };
    case "negative-numbers": {
      if (num2 === undefined) return null;
      const isAddition = Number(answer) === num1 + num2;
      const operator = isAddition ? "+" : "-";
      const secondOperand = num2 < 0 ? `(${num2})` : `${num2}`;
      return { problem: `${num1} ${operator} ${secondOperand}`, focus: "working with negative numbers — the rules for adding/subtracting negatives plus a quick sign shortcut" };
    }
    default:
      return null;
  }
}

function buildUserMessage(answer: string | number, { problem, focus }: ProblemFraming): string {
  return `Problem: ${problem}
Correct answer: ${answer}
Teach: ${focus}`;
}

function loadConfig() {
  const apiKey =
    process.env.AZURE_API_KEY ||
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.VITE_AZURE_API_KEY;
  const endpoint =
    process.env.AZURE_ENDPOINT ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    process.env.VITE_AZURE_ENDPOINT;
  const deployment =
    process.env.AZURE_DEPLOYMENT_NAME ||
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ||
    process.env.VITE_AZURE_DEPLOYMENT_NAME;

  return { apiKey, endpoint, deployment };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const payload = validate(ExplanationRequestSchema, req.body) as ExplainPayload;
    const { answer } = payload;

    const framing = describeProblem(payload);
    if (!framing) {
      return res.status(200).json({ explanation: DEFAULT_FALLBACK(answer) });
    }

    const { apiKey, endpoint, deployment } = loadConfig();
    if (!apiKey || !endpoint || !deployment) {
      console.error("[api/get-explanation] Missing Azure OpenAI configuration.");
      return apiError(res, 503, "AI service unavailable.");
    }

    const userMessage = buildUserMessage(answer, framing);

    let timeoutId: NodeJS.Timeout | null = null;

    try {
      const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

      const response = await Promise.race([
        client.getChatCompletions(
          deployment,
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          { maxTokens: 500, temperature: 0.4 }
        ),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("AI request timed out")), 20_000);
        }),
      ]);

      const text =
        response.choices?.[0]?.message?.content?.trim() ||
        DEFAULT_FALLBACK(answer);

      return res.status(200).json({ explanation: text });
    } catch (error) {
      console.error("[api/get-explanation] AI request failed:", error);
      const status = error instanceof Error && error.message.includes("timed out")
        ? 504
        : 500;
      return apiError(res, status, "AI explanation failed", { explanation: DEFAULT_FALLBACK(answer) });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error) {
    return handleApiError(res, "api/get-explanation", "Validation/configuration explanation request failed", error);
  }
}
