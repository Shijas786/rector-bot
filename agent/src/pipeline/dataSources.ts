/**
 * External Data Sources for Claim Verification
 * DuckDuckGo, NewsAPI.org, Wikipedia — all free.
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const ZERION_API_KEY = process.env.ZERION_API_KEY || "";

// ─── DuckDuckGo Instant Answer ────────────────────────────────────────────────

export interface DuckDuckGoResult {
    abstract: string;
    answer: string;
    heading: string;
    relatedTopics: string[];
    source: string;
}

export async function searchDuckDuckGo(query: string): Promise<DuckDuckGoResult> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const res = await fetch(url);
    const data = await res.json() as any;

    return {
        abstract: data.Abstract || "",
        answer: data.Answer || "",
        heading: data.Heading || "",
        relatedTopics: (data.RelatedTopics || [])
            .slice(0, 5)
            .map((t: any) => t.Text || "")
            .filter((t: string) => t),
        source: data.AbstractSource || "DuckDuckGo",
    };
}

// ─── NewsAPI.org ──────────────────────────────────────────────────────────────

export interface NewsResult {
    title: string;
    description: string;
    source: string;
    publishedAt: string;
    url: string;
}

export async function searchNews(query: string, days: number = 7): Promise<NewsResult[]> {
    if (!NEWS_API_KEY) {
        console.warn("[DataSources] NEWS_API_KEY not set, skipping NewsAPI");
        return [];
    }

    const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=relevancy&pageSize=5&apiKey=${NEWS_API_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json() as any;

        if (data.status !== "ok") return [];

        return (data.articles || []).slice(0, 5).map((a: any) => ({
            title: a.title || "",
            description: a.description || "",
            source: a.source?.name || "",
            publishedAt: a.publishedAt || "",
            url: a.url || "",
        }));
    } catch (e: any) {
        console.error("[NewsAPI] Error:", e.message);
        return [];
    }
}

// ─── Wikipedia ────────────────────────────────────────────────────────────────

export interface WikiResult {
    title: string;
    extract: string;
    description: string;
    url: string;
}

export async function searchWikipedia(query: string): Promise<WikiResult> {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            // Try search API fallback
            return await searchWikipediaFallback(query);
        }

        const data = await res.json() as any;
        return {
            title: data.title || "",
            extract: data.extract || "",
            description: data.description || "",
            url: data.content_urls?.desktop?.page || "",
        };
    } catch (e: any) {
        console.error("[Wikipedia] Error:", e.message);
        return { title: "", extract: "", description: "", url: "" };
    }
}

async function searchWikipediaFallback(query: string): Promise<WikiResult> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
    
    try {
        const res = await fetch(url);
        const data = await res.json() as any;
        const result = data?.query?.search?.[0];
        
        if (!result) return { title: "", extract: "", description: "", url: "" };

        // Fetch the full summary for the top result
        return await searchWikipedia(result.title);
    } catch {
        return { title: "", extract: "", description: "", url: "" };
    }
}

// ─── Zerion API ───────────────────────────────────────────────────────────────

export async function fetchZerion(path: string): Promise<any> {
    if (!ZERION_API_KEY) {
        throw new Error("ZERION_API_KEY not set");
    }

    const url = `https://api.zerion.io/v1/${path}`;
    const res = await fetch(url, {
        headers: {
            "accept": "application/json",
            "authorization": `Basic ${Buffer.from(ZERION_API_KEY + ":").toString("base64")}`,
        }
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Zerion Error] ${res.status} ${res.statusText} URL: ${url} Body: ${errorText}`);
        throw new Error(`Zerion API error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
}

/**
 * Get wallet portfolio stats (total value, etc.)
 */
export async function getZerionWalletPortfolio(address: string): Promise<any> {
    return await fetchZerion(`wallets/${address}/portfolio?sync=true`);
}

/**
 * Get list of fungible tokens in a wallet
 */
export async function getZerionWalletPositions(address: string): Promise<any> {
    return await fetchZerion(`wallets/${address}/positions?sync=true`);
}

/**
 * Get list of NFTs in a wallet
 */
export async function getZerionWalletNFTs(address: string): Promise<any> {
    return await fetchZerion(`wallets/${address}/nft-positions?sync=true`);
}

/**
 * Get specific fungible asset info (market cap, price, etc.)
 */
export async function getZerionFungible(assetId: string): Promise<any> {
    return await fetchZerion(`fungibles/${assetId}`);
}

/**
 * Get wallet PnL (Net Invested, Realized/Unrealized PnL)
 */
export async function getZerionWalletPnL(address: string): Promise<any> {
    return await fetchZerion(`wallets/${address}/pnl`);
}

// ─── Combined search for GPT context ─────────────────────────────────────────

export interface FactCheckEvidence {
    duckduckgo: DuckDuckGoResult;
    news: NewsResult[];
    wikipedia: WikiResult;
}

export async function gatherEvidence(query: string): Promise<FactCheckEvidence> {
    const [duckduckgo, news, wikipedia] = await Promise.all([
        searchDuckDuckGo(query),
        searchNews(query),
        searchWikipedia(query),
    ]);

    return { duckduckgo, news, wikipedia };
}
