import { prisma } from "./db/prisma.js";

export const SessionManager = {
    async get(telegramId: string) {
        const session = await (prisma as any).userSession.findUnique({ where: { telegramId } });
        console.log(`[SessionManager] GET ${telegramId} -> ${session?.awaitingConfirmation || "none"}`);
        return {
            lastDisambiguation: session?.lastDisambiguation as any,
            lastRunbook: session?.lastRunbook || undefined,
            awaitingConfirmation: (session?.awaitingConfirmation as "predict" | "execute" | "alert") || undefined,
        };
    },
    async set(telegramId: string, data: any) {
        console.log(`[SessionManager] SET ${telegramId}`, JSON.stringify(data).substring(0, 100));
        if (!data || Object.keys(data).length === 0) {
            await (prisma as any).userSession.deleteMany({ where: { telegramId } });
        } else {
            await (prisma as any).userSession.upsert({
                where: { telegramId },
                update: {
                    lastDisambiguation: data.lastDisambiguation || null,
                    lastRunbook: data.lastRunbook || null,
                    awaitingConfirmation: data.awaitingConfirmation || null,
                },
                create: {
                    telegramId,
                    lastDisambiguation: data.lastDisambiguation || null,
                    lastRunbook: data.lastRunbook || null,
                    awaitingConfirmation: data.awaitingConfirmation || null,
                }
            });
        }
    }
};
