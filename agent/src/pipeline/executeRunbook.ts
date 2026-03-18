import { readChainlinkPrice, getNativeBalance } from "../mcp/bsc.js";
import { getPolymarketEvent, getMarketOutcomeYesPrice } from "../mcp/polymarket.js";
import { searchDuckDuckGo, searchNews, searchWikipedia, getZerionWalletPortfolio, getZerionWalletPositions, getZerionWalletNFTs, getZerionFungible } from "./dataSources.js";

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
    overallOutcome: boolean;
    proofNarrative: string;
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
            console.log(`[Runbook] Executing Step #${step.id} (Type: ${step.type})`);
            let result: StepResult;
            
            if (step.type === "api_call" && step.source.includes("binance")) {
                result = await executeBinanceStep(step);
            } else if (step.type === "kline_check") {
                result = await executeBinanceKlineStep(step);
            } else if (step.type === "bsc_read") {
                result = await executeBscStep(step);
            } else if (step.type === "api_call" && step.source.includes("coingecko")) {
                result = await executeCoinGeckoStep(step);
            } else if (step.type === "api_call" && step.source.includes("polymarket.com")) {
                result = await executePolymarketStep(step);
            } else if (step.type.includes("wallet") || step.type === "portfolio_check") {
                result = await executeZerionWalletStep(step);
            } else if (step.type.includes("nft")) {
                result = await executeZerionNftStep(step);
            } else if (step.type.includes("asset")) {
                result = await executeZerionAssetStep(step);
            } else if (step.type.includes("bscscan") || step.type === "native_check") {
                result = await executeBscScanStep(step);
            } else if (step.type.includes("cryptocompare")) {
                result = await executeCryptoCompareStep(step);
            } else if (step.type === "web_search") {
                result = await executeDuckDuckGoStep(step);
            } else if (step.type === "news_search") {
                result = await executeNewsStep(step);
            } else if (step.type === "wiki_lookup") {
                result = await executeWikiStep(step);
            } else if (step.type === "api_call") {
                result = await executeGenericApiStep(step);
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
            
            console.log(`[Runbook] Result #${step.id}: ${result.passed ? "PASSED" : "FAILED"} - ${result.finding}`);

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

    const overallOutcome = results.every(r => r.passed);
    const proofNarrative = summarizeResults(results);

    return {
        stepResults: results,
        evidenceJSON: JSON.stringify({
            version: "1.0.0",
            attestationType: "AgenticVerification",
            timestamp,
            decision: overallOutcome ? "YES" : "NO",
            reasoning: proofNarrative,
            verificationPipeline: "OpenClaw-Rector",
            evidenceLog: results.map((r: StepResult) => ({
                step: r.stepId,
                source: r.source,
                finding: r.finding,
                passed: r.passed
            })),
        }, null, 2),
        overallOutcome,
        proofNarrative,
        timestamp,
    };
}

function summarizeResults(results: StepResult[]): string {
    const passedSteps = results.filter(r => r.passed);
    const failedSteps = results.filter(r => !r.passed);

    if (failedSteps.length === 0) {
        return `Verification successful across all ${results.length} steps. Primary findings: ${results.map((r: StepResult) => r.finding).join("; ")}.`;
    }

    return `Verification failed. ${failedSteps.length} of ${results.length} steps did not meet successful criteria. Failed findings: ${failedSteps.map((r: StepResult) => r.finding).join("; ")}.`;
}

interface ParsedStep {
    id: number;
    type: string;
    source: string;
    // ... Polymarket specific fields
    eventId?: string;
    marketIndex?: number;
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

        const typeMatch = body.match(/(?:Type|\*\*Type\*\*)\*?:\s*(\w+)/i);
        
        // Permissive source matching: Find URL or 0x address anywhere after the label
        const sourceMatch = body.match(/(?:Source|\*\*Source\*\*|Fetch Data)\*?:\s*.*?(https?:\/\/[^\s\n]+|0x[a-fA-F0-9]{40})/i);
        
        // Fallback: If no explicit source label, grab the first 0x address or URL in the body
        let source = sourceMatch?.[1]?.trim() || "";
        if (!source) {
            const fallbackAddr = body.match(/0x[a-fA-F0-9]{40}/);
            const fallbackUrl = body.match(/https?:\/\/[^\s\n]+/);
            source = fallbackAddr?.[0] || fallbackUrl?.[0] || "";
        }
        
        const contractMatch = body.match(/Contract\*?:\s*(0x[a-fA-F0-9]+)/i);
        const extractMatch = body.match(/Extract\*?:\s*(.+)/i);
        
        // Permissive success matching: Success:, **Success:**, or 3. **Apply Criteria**:
        const successMatch = body.match(/(?:Success|\*\*Success\*\*|Apply Criteria)\*?:\s*(.+)/i);

        // Extract Polymarket Event ID if present in source URL
        const eventIdMatch = sourceMatch?.[1]?.match(/events\/(\d+)/);

        steps.push({
            id,
            type: typeMatch?.[1]?.trim().toLowerCase() || "unknown",
            source: source || contractMatch?.[1]?.trim() || "",
            contract: contractMatch?.[1]?.trim(),
            eventId: eventIdMatch ? eventIdMatch[1] : undefined,
            extract: extractMatch?.[1]?.trim(),
            successCondition: successMatch?.[1]?.trim(),
        });
    }

    return steps;
}

async function executeBinanceKlineStep(step: ParsedStep): Promise<StepResult> {
    const res = await fetch(step.source);
    const data = await res.json() as any[][];

    if (!Array.isArray(data)) {
        throw new Error("Invalid kline data returned from Binance");
    }

    // Candle format: [openTime, open, high, low, close, volume, closeTime, ...]
    // We check high for >= targets and low for <= targets
    let peakValue = 0;
    const isDownside = step.successCondition?.includes("<");

    if (isDownside) {
        // Find minimum low
        peakValue = Math.min(...data.map(c => parseFloat(c[3])));
    } else {
        // Find maximum high
        peakValue = Math.max(...data.map(c => parseFloat(c[2])));
    }

    return {
        stepId: step.id,
        type: step.type,
        source: step.source,
        value: peakValue,
        passed: evaluateSuccess(step.successCondition || "", peakValue),
        finding: `${isDownside ? "Min Low" : "Max High"} was $${peakValue} in interval`,
        error: null,
    };
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
    const contract = step.contract || step.source;
    if (!contract || !contract.startsWith("0x")) {
        throw new Error("No valid contract address for BSC step");
    }

    const rawPrice = await readChainlinkPrice(contract);

    return {
        stepId: step.id,
        type: step.type,
        source: contract || "",
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

async function executePolymarketStep(step: ParsedStep): Promise<StepResult> {
    if (!step.eventId) {
        throw new Error("No PolyMarket event ID found in source URL");
    }

    const yesPrice = await getMarketOutcomeYesPrice(step.eventId);
    if (yesPrice === null) {
        throw new Error(`Could not fetch Polymarket event ${step.eventId}`);
    }

    const event = await getPolymarketEvent(step.eventId);
    let finding = `Polymarket "Yes" Probability = ${(yesPrice * 100).toFixed(1)}%`;
    if (event?.closed) finding += " (MARKET CLOSED)";

    return {
        stepId: step.id,
        type: step.type,
        source: step.source,
        value: yesPrice,
        // Success: Polymarket resolves to 1 (True) or 0 (False), or user query targets a specific probability
        passed: evaluateSuccess(step.successCondition || "", yesPrice),
        finding,
        error: null,
    };
}

/**
 * Simple success condition evaluator.
 * Supports: value >= X, value > X, value <= X, value < X, value == X
 */
function evaluateSuccess(condition: string, value: number): boolean {
    const eqMatch = condition.match(/== ?\$?([\d.]+)/);
    if (eqMatch) return value === parseFloat(eqMatch[1]);

    const gteMatch = condition.match(/>= ?\$?([\d.]+)/);
    if (gteMatch) return value >= parseFloat(gteMatch[1]);

    const gtMatch = condition.match(/> ?\$?([\d.]+)/);
    if (gtMatch) return value > parseFloat(gtMatch[1]);

    const lteMatch = condition.match(/<= ?\$?([\d.]+)/);
    if (lteMatch) return value <= parseFloat(lteMatch[1]);

    const ltMatch = condition.match(/< ?\$?([\d.]+)/);
    if (ltMatch) return value < parseFloat(ltMatch[1]);

    // Handle string "true/false" resolutions for Polymarket
    if (condition.toLowerCase().includes("true") && value === 1) return true;
    if (condition.toLowerCase().includes("false") && value === 0) return true;

    return false;
}

// ─── DuckDuckGo Step ──────────────────────────────────────────────────────────

async function executeDuckDuckGoStep(step: ParsedStep): Promise<StepResult> {
    const query = step.extract || step.source;
    const result = await searchDuckDuckGo(query);

    const combinedText = [result.answer, result.abstract, ...result.relatedTopics]
        .filter(t => t)
        .join(" | ");

    return {
        stepId: step.id,
        type: step.type,
        source: `DuckDuckGo: ${query}`,
        value: null,
        passed: combinedText.length > 0,
        finding: combinedText.substring(0, 500) || "No results found",
        error: null,
    };
}

// ─── NewsAPI Step ─────────────────────────────────────────────────────────────

async function executeNewsStep(step: ParsedStep): Promise<StepResult> {
    const query = step.extract || step.source;
    const articles = await searchNews(query);

    if (articles.length === 0) {
        return {
            stepId: step.id,
            type: step.type,
            source: `NewsAPI: ${query}`,
            value: null,
            passed: false,
            finding: "No relevant news articles found",
            error: null,
        };
    }

    const summary = articles
        .map(a => `[${a.source}] ${a.title}: ${a.description}`)
        .join(" || ")
        .substring(0, 800);

    return {
        stepId: step.id,
        type: step.type,
        source: `NewsAPI: ${query}`,
        value: articles.length,
        passed: true,
        finding: summary,
        error: null,
    };
}

// ─── Wikipedia Step ───────────────────────────────────────────────────────────

async function executeWikiStep(step: ParsedStep): Promise<StepResult> {
    const query = step.extract || step.source;
    const wiki = await searchWikipedia(query);

    if (!wiki.extract) {
        return {
            stepId: step.id,
            type: step.type,
            source: `Wikipedia: ${query}`,
            value: null,
            passed: false,
            finding: "No Wikipedia article found",
            error: null,
        };
    }

    return {
        stepId: step.id,
        type: step.type,
        source: wiki.url || `Wikipedia: ${query}`,
        value: null,
        passed: true,
        finding: `${wiki.title}: ${wiki.extract}`.substring(0, 500),
        error: null,
    };
}

// ─── Generic API Step ─────────────────────────────────────────────────────────

async function executeGenericApiStep(step: ParsedStep): Promise<StepResult> {
    try {
        const res = await fetch(step.source);
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }

        return {
            stepId: step.id,
            type: step.type,
            source: step.source,
            value: null,
            passed: true,
            finding: JSON.stringify(data).substring(0, 500),
            error: null,
        };
    } catch (e: any) {
        return {
            stepId: step.id,
            type: step.type,
            source: step.source,
            value: null,
            passed: false,
            finding: "API call failed",
            error: e.message,
        };
    }
}

// ─── Zerion Steps ─────────────────────────────────────────────────────────────

async function executeZerionWalletStep(step: ParsedStep): Promise<StepResult> {
    const address = step.source.trim();
    if (!address || !address.startsWith("0x")) {
        throw new Error("Missing or invalid wallet address for Zerion check");
    }
    try {
        const [portfolio, positions] = await Promise.all([
            getZerionWalletPortfolio(address),
            getZerionWalletPositions(address)
        ]);

        const totalValue = portfolio?.data?.attributes?.total?.positions || portfolio?.data?.attributes?.total?.value || 0;
        
        // Extract top 3 positions for evidence transparency
        const top3 = (positions?.data || [])
            .slice(0, 3)
            .map((p: any) => `${p.attributes?.fungible_info?.symbol || "TOKEN"}: $${Math.round(p.attributes?.value || 0)}`)
            .join(", ");

        const finding = top3 
            ? `Wallet = $${totalValue.toLocaleString()} (Top: ${top3})`
            : `Wallet portfolio value = $${totalValue.toLocaleString()}`;

        return {
            stepId: step.id,
            type: step.type,
            source: `Zerion Wallet: ${address}`,
            value: totalValue,
            passed: evaluateSuccess(step.successCondition || "", totalValue),
            finding: finding,
            error: null,
        };
    } catch (e: any) {
        return {
            stepId: step.id,
            type: step.type,
            source: `Zerion Wallet: ${address}`,
            value: null,
            passed: false,
            finding: `Zerion check failed: ${e.message}`,
            error: e.message,
        };
    }
}

async function executeZerionNftStep(step: ParsedStep): Promise<StepResult> {
    const address = step.source.trim();
    const nftPositions = await getZerionWalletNFTs(address);
    const nfts = nftPositions?.data || [];
    
    // Check if a specific collection is required via extract field
    const requiredCollection = step.extract?.toLowerCase();
    let passed = nfts.length > 0;
    let finding = `Wallet holds ${nfts.length} NFT positions`;

    if (requiredCollection) {
        const hasCollection = nfts.some((n: any) => 
            n.attributes?.nft_info?.collection_info?.name?.toLowerCase().includes(requiredCollection) ||
            n.attributes?.nft_info?.collection_info?.id?.toLowerCase() === requiredCollection
        );
        passed = hasCollection;
        finding = hasCollection 
            ? `Wallet holds ${requiredCollection} NFT`
            : `Wallet does NOT hold ${requiredCollection} NFT`;
    }

    return {
        stepId: step.id,
        type: step.type,
        source: `Zerion NFTs: ${address}`,
        value: nfts.length,
        passed,
        finding,
        error: null,
    };
}

async function executeZerionAssetStep(step: ParsedStep): Promise<StepResult> {
    const assetId = step.source.trim(); // e.g., "ethereum-mainnet:0xC02aa..."
    const asset = await getZerionFungible(assetId);
    const attr = asset?.data?.attributes;

    const marketCap = attr?.market_data?.market_cap || 0;
    const price = attr?.market_data?.price || 0;

    let targetValue = price;
    let finding = `Asset price = $${price}`;

    if (step.extract === "market_cap") {
        targetValue = marketCap;
        finding = `Asset market cap = $${marketCap}`;
    }

    return {
        stepId: step.id,
        type: step.type,
        source: `Zerion Asset: ${assetId}`,
        value: targetValue,
        passed: evaluateSuccess(step.successCondition || "", targetValue),
        finding,
        error: null,
    };
}
async function executeBscScanStep(step: ParsedStep): Promise<StepResult> {
    const address = step.source;
    try {
        const balance = await getNativeBalance(address);
        return {
            stepId: step.id,
            type: step.type,
            source: `BSC Native: ${address}`,
            value: balance,
            passed: evaluateSuccess(step.successCondition || "", balance),
            finding: `Native BNB balance = ${balance.toFixed(4)}`,
            error: null,
        };
    } catch (e: any) {
        // Fallback or bubble up
        throw new Error(`BSC Balance check failed: ${e.message}`);
    }
}

async function executeCryptoCompareStep(step: ParsedStep): Promise<StepResult> {
    // If it's a generic API call for price
    const res = await fetch(step.source);
    const data = await res.json() as any;
    
    // CryptoCompare usually returns { "USD": 123 }
    const price = data.USD || data.price || 0;

    return {
        stepId: step.id,
        type: step.type,
        source: step.source,
        value: price,
        passed: evaluateSuccess(step.successCondition || "", price),
        finding: `External price (CC) = $${price}`,
        error: null,
    };
}
