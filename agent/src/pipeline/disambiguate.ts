import OpenAI from "openai";

/**
 * Prediction Disambiguation Pipeline
 * Uses GPT-4o to normalize raw prediction text into a precise, verifiable statement.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DisambiguationResult {
    disambiguated: string;
    entities: string[];
    successCriteria: string;
    verifiability: "HIGH" | "MEDIUM" | "LOW";
    primarySource: "binance_api" | "polymarket_api" | "chainlink_bsc" | "coingecko";
    bscContract: string | null;
    ambiguities: string[];
    resolutionDate: string;
}

/**
 * Disambiguate a raw prediction into a precise verifiable statement.
 */
export async function disambiguatePrediction(
    rawText: string,
    resolutionDate: string
): Promise<DisambiguationResult> {
    const prompt = `You are an elite Agentic Verification Oracle on BNB Smart Chain via OpenClaw.

User claim/prediction: "${rawText}"
Target resolution date: ${resolutionDate}

Your job is to rewrite this as a precise, mathematically and temporally verifiable statement.
Extract: key entities, success criteria, and any ambiguities.
Rate verifiability: HIGH / MEDIUM / LOW.

Suggest the best verification source:
- If it's about crypto prices on exchanges: prefer "binance_api" or "coingecko"
- If it's about real-world events, politics, or pop-culture: prefer "polymarket_api"
- If it's about on-chain DeFi data: prefer "chainlink_bsc"

Return ONLY JSON:
{
  "disambiguated": "...",
  "entities": [...],
  "successCriteria": "...",
  "verifiability": "HIGH|MEDIUM|LOW",
  "primarySource": "binance_api|polymarket_api|chainlink_bsc|coingecko",
  "bscContract": "0x... or null",
  "ambiguities": [...],
  "resolutionDate": "${resolutionDate}"
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content) as DisambiguationResult;
}

/**
 * Format disambiguation result for user confirmation.
 */
export function formatDisambiguation(result: DisambiguationResult): string {
    const verIcon = result.verifiability === "HIGH" ? "✅" :
        result.verifiability === "MEDIUM" ? "⚡" : "⚠️";

    return `Got it! Here's what I understood:

PREDICTION:
${result.disambiguated}

Verifiability: ${result.verifiability} ${verIcon}
Primary source: ${result.primarySource.replace("_", " ")}
${result.ambiguities.length > 0 ? `\n⚠️ Possible ambiguities:\n${result.ambiguities.map(a => `• ${a}`).join("\n")}` : ""}

Is this correct? (yes/no)`;
}
