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
    primarySource: "binance_api" | "polymarket_api" | "chainlink_bsc" | "coingecko" | "zerion_api" | "news_api" | "duckduckgo";
    bscContract: string | null;
    ambiguities: string[];
    resolutionDate: string;
    feasibility: string;
    recommendation: "APPROVE" | "REJECT";
}

/**
 * Disambiguate a raw prediction into a precise verifiable statement.
 */
export async function disambiguatePrediction(
    rawText: string,
    resolutionDate: Date
): Promise<DisambiguationResult> {
    const currentTime = new Date().toISOString();
    const targetDate = resolutionDate.toISOString();

    const prompt = `You are an elite Agentic Verification Oracle on BNB Smart Chain via OpenClaw.

Current Oracle Time: ${currentTime}
User claim/prediction: "${rawText}"
Initial target resolution date: ${targetDate}

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
  "primarySource": "binance_api|polymarket_api|chainlink_bsc|coingecko|zerion_api|news_api|duckduckgo",
  "bscContract": "0x... or null",
  "ambiguities": [...],
  "resolutionDate": "ISO_8601_DATE_STRING",
  "feasibility": "Detailed explanation of why this is or isn't verifiable",
  "recommendation": "APPROVE|REJECT"
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
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
Feasibility: ${result.feasibility}
Recommendation: ${result.recommendation === "APPROVE" ? "✅ APPROVED" : "❌ REJECTED - Too ambiguous or unverifiable"}
${result.ambiguities.length > 0 ? `\n⚠️ Possible ambiguities:\n${result.ambiguities.map(a => `• ${a}`).join("\n")}` : ""}

${result.recommendation === "APPROVE" ? "Shall I proceed to build the Runbook? (yes/no)" : "I recommend NOT proceeding. Do you want to force it anyway? (yes/no)"}`;
}
