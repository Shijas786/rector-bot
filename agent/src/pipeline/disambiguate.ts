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
    primarySource: "binance_api" | "chainlink_bsc" | "coingecko";
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
    const prompt = `You are an onchain prediction verification assistant
on BNB Smart Chain via OpenClaw.

User prediction: "${rawText}"
Resolution date: ${resolutionDate}

Rewrite as precise verifiable statement.
Extract: entities, success criteria, ambiguities.
Rate verifiability: HIGH / MEDIUM / LOW.
Suggest verification sources — prefer Binance API first.

Return ONLY JSON:
{
  "disambiguated": "...",
  "entities": [...],
  "successCriteria": "...",
  "verifiability": "HIGH|MEDIUM|LOW",
  "primarySource": "binance_api|chainlink_bsc|coingecko",
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
