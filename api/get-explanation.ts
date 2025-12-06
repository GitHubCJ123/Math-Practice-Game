import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

const ALLOWED_OPERATIONS = [
  "multiplication",
  "division",
  "squares",
  "square-roots",
  "fraction-to-decimal",
  "decimal-to-fraction",
];

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const payload = req.body as Partial<ExplainPayload>;
  const { num1, num2, operation, answer } = payload;

  if (
    typeof num1 !== "number" ||
    (num2 !== undefined && typeof num2 !== "number") ||
    typeof operation !== "string" ||
    !ALLOWED_OPERATIONS.includes(operation) ||
    answer === undefined
  ) {
    return res.status(400).json({ message: "Invalid request payload." });
  }

  const { apiKey, endpoint, deployment } = loadConfig();
  if (!apiKey || !endpoint || !deployment) {
    console.error("[api/get-explanation] Missing Azure OpenAI configuration.");
    return res.status(503).json({ message: "AI service unavailable." });
  }

  const prompt = buildPrompt({ num1, num2, operation, answer });

  try {
    // Hard timeout so the client doesn't hang forever
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    const response = await client.getChatCompletions(
      deployment,
      [{ role: "user", content: prompt }],
      { maxTokens: 200, signal: controller.signal }
    );

    clearTimeout(timer);

    const text =
      response.choices?.[0]?.message?.content?.trim() ||
      DEFAULT_FALLBACK(answer);

    return res.status(200).json({ explanation: text });
  } catch (error) {
    console.error("[api/get-explanation] Error generating explanation:", error);
    return res.status(200).json({ explanation: DEFAULT_FALLBACK(answer) });
  }
}

