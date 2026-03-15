import OpenAI from "openai";
import { StepResult } from "./executeRunbook.js";

/**
 * Outcome Determination Pipeline
 * Uses GPT-4o to analyze evidence and determine prediction outcome.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface OutcomeResult {
    outcome: boolean | "INCONCLUSIVE";
    confidence: number;
    stepResults: Array<{
        stepId: number;
        passed: boolean;
        finding: string;
    }>;
    citedSources: string[];
    reasoning: string;
    inconclusiveReason?: string;
}

/**
 * Determine the outcome of a prediction based on evidence.
 */
export async function determineOutcome(
    disambiguated: string,
    successCriteria: string,
    runbookMarkdown: string,
    stepResults: StepResult[]
): Promise<OutcomeResult> {
    const prompt = `You are an onchain prediction verification assistant.
Determine outcome. Return ONLY JSON.

PREDICTION: "${disambiguated}"
SUCCESS CRITERIA: "${successCriteria}"
RUNBOOK: ${(runbookMarkdown || "").substring(0, 2000)}
EVIDENCE: ${JSON.stringify(stepResults)}

Rules:
- Binance API = most authoritative
- Require ≥2 sources to agree for TRUE
- Conflicting evidence → INCONCLUSIVE
- reasoning ≤280 chars (stored onchain)

{
  "outcome": true | false | "INCONCLUSIVE",
  "confidence": 0-100,
  "stepResults": [
    {"stepId": 1, "passed": true,
     "finding": "BNB = $1043 on Binance"}
  ],
  "citedSources": ["https://...", "bsc:0x..."],
  "reasoning": "≤280 chars stored onchain",
  "inconclusiveReason": "if applicable"
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content) as OutcomeResult;
}

/**
 * Format outcome result for user notification.
 */
export function formatOutcome(
    predictionId: number,
    outcome: OutcomeResult,
    txHash: string,
    correct: number,
    total: number
): string {
    if (outcome.outcome === "INCONCLUSIVE") {
        return `⚠️ PREDICTION #${predictionId} — INCONCLUSIVE

${outcome.inconclusiveReason || "Sources conflicted"}

Reasoning: ${outcome.reasoning}

Onchain proof:
🔗 https://testnet.bscscan.com/tx/${txHash}`;
    }

    const statusEmoji = outcome.outcome ? "✅" : "❌";
    const statusText = outcome.outcome ? "TRUE" : "FALSE";

    const stepsText = outcome.stepResults
        .map((s) => `${s.passed ? "✓" : "✗"} Step ${s.stepId}: ${s.finding}`)
        .join("\n      ");

    return `${statusEmoji} PREDICTION #${predictionId} — ${statusText}

      ${stepsText}
      Confidence: ${outcome.confidence}%

      Reasoning: ${outcome.reasoning}

      Onchain proof:
      🔗 https://testnet.bscscan.com/tx/${txHash}

      Your record: ${correct}/${total} correct 🎯`;
}
