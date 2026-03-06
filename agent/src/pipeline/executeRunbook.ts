import { readChainlinkPrice } from "../mcp/bsc.js";

/**
 * Runbook Execution Pipeline
 * Executes each step in the verification runbook on resolution date.
 */

const BINANCE_API = process.env.BINANCE_API_URL || "https://api.binance.com";

export interface StepResult {
    stepId: number;
    type: string;
    source: string;
    value: number | null;
    passed: boolean;
    finding: string;
    error: string | null;
}

export interface RunbookExecution {
    stepResults: StepResult[];
    evidenceJSON: string;
    timestamp: string;
}

/**
 * Parse and execute a runbook markdown string.
 * Returns step-by-step results.
 */
export async function executeRunbook(runbookMarkdown: string): Promise<RunbookExecution> {
    const steps = parseRunbookSteps(runbookMarkdown);
    const results: StepResult[] = [];
    const timestamp = new Date().toISOString();

    for (const step of steps) {
        try {
            let result: StepResult;

            if (step.type === "api_call" && step.source.includes("binance")) {
                result = await executeBinanceStep(step);
            } else if (step.type === "bsc_read") {
                result = await executeBscStep(step);
            } else if (step.type === "api_call" && step.source.includes("coingecko")) {
                result = await executeCoinGeckoStep(step);
            } else {
                result = {
                    stepId: step.id,
                    type: step.type,
                    source: step.source,
                    value: null,
                    passed: false,
                    finding: "Unknown step type",
                    error: `Unsupported step type: ${step.type}`,
                };
            }

            results.push(result);
        } catch (error: any) {
            results.push({
                stepId: step.id,
                type: step.type,
                source: step.source,
                value: null,
                passed: false,
                finding: "Step failed",
                error: error.message,
            });
        }
    }

    return {
        stepResults: results,
        evidenceJSON: JSON.stringify({
            timestamp,
            steps: results,
            runbook: runbookMarkdown.substring(0, 500),
        }, null, 2),
        timestamp,
    };
}

interface ParsedStep {
    id: number;
    type: string;
    source: string;
    contract?: string;
    extract?: string;
    successCondition?: string;
}

function parseRunbookSteps(markdown: string): ParsedStep[] {
    const steps: ParsedStep[] = [];
    const stepRegex = /### Step (\d+).*?\n([\s\S]*?)(?=### Step|\n## |$)/g;

    let match;
    while ((match = stepRegex.exec(markdown)) !== null) {
        const id = parseInt(match[1]);
        const body = match[2];

        const typeMatch = body.match(/Type:\s*(\w+)/);
        const sourceMatch = body.match(/Source:\s*(https?:\/\/[^\s]+)/);
        const contractMatch = body.match(/Contract:\s*(0x[a-fA-F0-9]+)/);
        const extractMatch = body.match(/Extract:\s*(.+)/);
        const successMatch = body.match(/Success:\s*(.+)/);

        steps.push({
            id,
            type: typeMatch?.[1] || "unknown",
            source: sourceMatch?.[1] || contractMatch?.[1] || "",
            contract: contractMatch?.[1],
            extract: extractMatch?.[1]?.trim(),
            successCondition: successMatch?.[1]?.trim(),
        });
    }

    return steps;
}

async function executeBinanceStep(step: ParsedStep): Promise<StepResult> {
    const res = await fetch(step.source);
    const data = await res.json() as { price?: string; lastPrice?: string; symbol?: string };

    const price = parseFloat(data.price || data.lastPrice || "0");

    return {
        stepId: step.id,
        type: step.type,
        source: step.source,
        value: price,
        passed: evaluateSuccess(step.successCondition || "", price),
        finding: `Price = $${price} on Binance`,
        error: null,
    };
}

async function executeBscStep(step: ParsedStep): Promise<StepResult> {
    if (!step.contract) {
        throw new Error("No contract address for BSC step");
    }

    const rawPrice = await readChainlinkPrice(step.contract);

    return {
        stepId: step.id,
        type: step.type,
        source: step.contract,
        value: rawPrice,
        passed: evaluateSuccess(step.successCondition || "", rawPrice),
        finding: `Chainlink price = $${rawPrice.toFixed(2)}`,
        error: null,
    };
}

async function executeCoinGeckoStep(step: ParsedStep): Promise<StepResult> {
    const res = await fetch(step.source);
    const data = await res.json() as Record<string, { usd: number }>;

    // Extract the first coin's USD price
    const firstCoin = Object.values(data)[0];
    const price = firstCoin?.usd || 0;

    return {
        stepId: step.id,
        type: step.type,
        source: step.source,
        value: price,
        passed: evaluateSuccess(step.successCondition || "", price),
        finding: `CoinGecko price = $${price}`,
        error: null,
    };
}

/**
 * Simple success condition evaluator.
 * Supports: value >= X, value > X, value <= X, value < X
 */
function evaluateSuccess(condition: string, value: number): boolean {
    const gteMatch = condition.match(/>= ?\$?([\d.]+)/);
    if (gteMatch) return value >= parseFloat(gteMatch[1]);

    const gtMatch = condition.match(/> ?\$?([\d.]+)/);
    if (gtMatch) return value > parseFloat(gtMatch[1]);

    const lteMatch = condition.match(/<= ?\$?([\d.]+)/);
    if (lteMatch) return value <= parseFloat(lteMatch[1]);

    const ltMatch = condition.match(/< ?\$?([\d.]+)/);
    if (ltMatch) return value < parseFloat(ltMatch[1]);

    return false;
}
