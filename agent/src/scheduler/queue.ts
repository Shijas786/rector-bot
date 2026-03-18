import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../db/prisma.js";
import { downloadRunbook } from "../mcp/greenfield.js";
import { executeRunbook } from "../pipeline/executeRunbook.js";
import { determineOutcome, formatOutcome } from "../pipeline/determineOutcome.js";
import { packageAndUploadEvidence } from "../pipeline/packageEvidence.js";
import { resolvePrediction, markInconclusive, getAccuracy } from "../mcp/bsc.js";

/**
 * BullMQ Scheduler
 * Schedules resolution jobs for predictions on their deadline date.
 */

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const QUEUE_NAME = "prediction-resolution";

export const resolutionQueue = new Queue(QUEUE_NAME, { connection: connection as any });

/**
 * Schedule a prediction for auto-resolution.
 */
export async function scheduleResolution(
    predictionId: number,
    resolutionDate: Date,
    disambiguated: string,
    successCriteria: string,
    runbookRef: string
): Promise<void> {
    const delay = resolutionDate.getTime() - Date.now();

    if (delay <= 0) {
        console.warn(`[Scheduler] Prediction #${predictionId} resolution date already passed`);
        return;
    }

    await resolutionQueue.add(
        "resolve",
        {
            predictionId,
            disambiguated,
            successCriteria,
            resolutionDate: resolutionDate.toISOString(),
            runbookRef,
        },
        {
            delay,
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
            jobId: `resolve-${predictionId}`,
        }
    );

    console.log(`[Scheduler] Prediction #${predictionId} scheduled for ${resolutionDate.toISOString()}`);
}

/**
 * Start the resolution worker.
 */
export function startWorker(
    onNotify?: (telegramId: string, message: string) => Promise<void>
): Worker {
    const worker = new Worker(
        QUEUE_NAME,
        async (job: Job) => {
            const { predictionId, disambiguated, successCriteria, resolutionDate, runbookRef } = job.data;
            console.log(`[Worker] Resolving prediction #${predictionId}...`);

            try {
                // 1. Download the runbook from Greenfield
                if (!runbookRef) throw new Error("No runbookRef provided in job data");
                const runbook = await downloadRunbook(runbookRef);

                // 2. Execute the runbook steps
                const execution = await executeRunbook(runbook);

                // 3. Determine outcome using GPT-4o
                const outcome = await determineOutcome(
                    disambiguated,
                    successCriteria,
                    runbook,
                    execution.stepResults
                );

                // 4. Package evidence and upload to Greenfield
                const { evidenceRef, signature } = await packageAndUploadEvidence(
                    predictionId,
                    disambiguated,
                    successCriteria,
                    resolutionDate,
                    execution.stepResults,
                    outcome
                );

                // 5. Resolve onchain
                let txHash: string;

                if (outcome.outcome === "INCONCLUSIVE") {
                    const result = await markInconclusive(predictionId);
                    txHash = result.txHash;
                } else {
                    const result = await resolvePrediction(
                        predictionId,
                        outcome.outcome as boolean,
                        outcome.confidence,
                        evidenceRef,
                        outcome.reasoning,
                        signature
                    );
                    txHash = result.txHash;
                }

                // 6. Update database
                const prediction = await prisma.prediction.update({
                    where: { onchainId: predictionId },
                    data: {
                        status: outcome.outcome === "INCONCLUSIVE" ? "INCONCLUSIVE" : "RESOLVED",
                        outcome: outcome.outcome === "INCONCLUSIVE" ? null : (outcome.outcome as boolean),
                        confidence: outcome.confidence,
                        evidenceRef,
                        reasoning: outcome.reasoning,
                        txHashResolve: txHash,
                        resolvedAt: new Date(),
                    },
                    include: { user: true },
                });

                // 7. Notify user via Telegram
                if (onNotify && prediction.user.telegramId) {
                    const accuracy = await getAccuracy(prediction.user.shadowAddress || "0x0000000000000000000000000000000000000000");
                    const message = formatOutcome(
                        predictionId,
                        prediction.id,
                        outcome,
                        txHash,
                        accuracy.correct,
                        accuracy.total
                    );
                    await onNotify(prediction.user.telegramId, message);
                }

                console.log(`[Worker] Prediction #${predictionId} resolved: ${outcome.outcome}`);
            } catch (error: any) {
                console.error(`[Worker] Failed to resolve prediction #${predictionId}:`, error.message);
                throw error;
            }
        },
        { connection: connection as any, concurrency: 5 }
    );

    worker.on("completed", (job) => {
        console.log(`[Worker] Job ${job.id} completed`);
    });

    worker.on("failed", (job, error) => {
        console.error(`[Worker] Job ${job?.id} failed:`, error.message);
    });

    return worker;
}
