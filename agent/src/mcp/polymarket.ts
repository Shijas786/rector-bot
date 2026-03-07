/**
 * Polymarket Gamma API Integration
 * Fetches event resolution status for Agentic Verification runbooks.
 */

const POLYMARKET_GAMMA_API = process.env.POLYMARKET_GAMMA_API || "https://gamma-api.polymarket.com";

export interface PolymarketEvent {
    id: string;
    title: string;
    description: string;
    active: boolean;
    closed: boolean;
    conditionId: string;
    markets: Array<{
        id: string;
        question: string;
        groupItemTitle: string;
        outcomePrices: string[];
    }>;
}

/**
 * Fetch a Polymarket event by ID.
 */
export async function getPolymarketEvent(eventId: string): Promise<PolymarketEvent | null> {
    try {
        const res = await fetch(`${POLYMARKET_GAMMA_API}/events/${eventId}`);
        if (!res.ok) {
            console.error(`[Polymarket] Failed to fetch event ${eventId}: ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        return data as PolymarketEvent;
    } catch (error) {
        console.error(`[Polymarket] Error fetching event ${eventId}:`, error);
        return null;
    }
}

/**
 * Check if a specific market outcome has resolved.
 * Returns the current probability (price) of the 'Yes' token.
 * If the market is closed/resolved, it returns 1.0 (True) or 0.0 (False).
 */
export async function getMarketOutcomeYesPrice(eventId: string, marketIndex: number = 0): Promise<number | null> {
    const event = await getPolymarketEvent(eventId);
    if (!event || !event.markets || event.markets.length <= marketIndex) {
        return null;
    }

    const market = event.markets[marketIndex];

    // Outcome Prices are typically ["Yes", "No"], represented as "0.50"
    if (market.outcomePrices && market.outcomePrices.length > 0) {
        const yesPrice = parseFloat(market.outcomePrices[0]);
        return yesPrice;
    }

    return null;
}
