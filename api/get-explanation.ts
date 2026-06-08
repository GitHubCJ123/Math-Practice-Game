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

function buildPrompt({ num1, num2, operation, answer }: ExplainPayload): string {
  switch (operation) {
    case "multiplication":
    case "division":
    case "squares":
    case "square-roots": {
      const problemString =
        operation === "multiplication"
          ? `${num1} × ${num2}`
          : operation === "division"
            ? `${num1} ÷ ${num2}`
            : operation === "squares"
              ? `${num1}²`
              : `√${num1}`;
      return `You are a math speed coach. A student needs to solve "${problemString}" quickly.
1) Briefly explain the standard method.
2) Provide a mental math trick or shortcut to solve it faster.
Keep the entire explanation concise and encouraging. The correct answer is ${answer}.`;
    }
    case "fraction-to-decimal":
      return `You are a math speed coach. A student needs to convert the fraction ${num1}/${num2} to a decimal.
1) Briefly explain the long division method (numerator divided by denominator).
2) Explain how to handle repeating decimals by rounding to three decimal places.
Keep the explanation concise and clear. The correct answer is ${answer}.`;
    case "decimal-to-fraction":
      return `You are a math speed coach. A student needs to convert the decimal ${num1} to a fraction in simplest form.
1) Explain how to convert the decimal to a fraction based on its place value (e.g., 0.75 = 75/100).
2) Explain how to simplify the fraction to its lowest terms by finding the greatest common divisor.
Keep the explanation concise and clear. The correct answer is ${answer}.`;
    case "fraction-to-percent":
      return `You are a math speed coach. A student needs to convert the fraction ${num1}/${num2} to a percent.
1) Explain dividing the numerator by the denominator to get a decimal.
2) Explain multiplying by 100 to get a percent and rounding repeating values to one decimal place (e.g., 1/3 ≈ 33.3%).
Keep the explanation concise and clear. The correct answer is ${answer}.`;
    case "percent-to-fraction":
      return `You are a math speed coach. A student needs to convert ${num1}% to a fraction in simplest form.
1) Explain writing the percent as a fraction over 100 (or 1000 for one decimal place).
2) Explain simplifying the fraction using the greatest common divisor.
Keep the explanation concise and clear. The correct answer is ${answer}.`;
    case "negative-numbers": {
      if (num2 === undefined) {
        return DEFAULT_FALLBACK(answer);
      }
      const isAddition = Number(answer) === num1 + num2;
      const operator = isAddition ? "+" : "-";
      const secondOperand = num2 < 0 ? `(${num2})` : `${num2}`;
      const problemString = `${num1} ${operator} ${secondOperand}`;
      return `You are a math speed coach. A student needs to solve "${problemString}" quickly.
1) Briefly explain how to work with negative numbers (adding negatives, subtracting negatives, etc.).
2) Provide a mental math trick or shortcut to solve it faster.
Keep the entire explanation concise and encouraging. The correct answer is ${answer}.`;
    }
    default:
      return DEFAULT_FALLBACK(answer);
  }
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
    const { num1, num2, operation, answer } = payload;
    const { apiKey, endpoint, deployment } = loadConfig();
    if (!apiKey || !endpoint || !deployment) {
      console.error("[api/get-explanation] Missing Azure OpenAI configuration.");
      return apiError(res, 503, "AI service unavailable.");
    }

    const prompt = buildPrompt({ num1, num2, operation, answer });

    let timeoutId: NodeJS.Timeout | null = null;

    try {
      const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

      const response = await Promise.race([
        client.getChatCompletions(
          deployment,
          [{ role: "user", content: prompt }],
          { maxTokens: 200 }
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
