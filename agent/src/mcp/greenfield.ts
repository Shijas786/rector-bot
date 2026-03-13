import { mcpClient } from "./client.js";

/**
 * BNB Greenfield storage operations via MCP.
 * Used to store runbooks and evidence for predictions.
 */

const RUNBOOKS_BUCKET = process.env.GREENFIELD_RUNBOOKS_BUCKET || "predict-runbooks";
const EVIDENCE_BUCKET = process.env.GREENFIELD_EVIDENCE_BUCKET || "predict-evidence";

import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Upload a runbook to BNB Greenfield.
 */
export async function uploadRunbook(
    predictionId: number,
    runbookContent: string
): Promise<string> {
    const objectName = `predict-${predictionId}-runbook.md`;
    const tempPath = join(tmpdir(), objectName);
    writeFileSync(tempPath, runbookContent);

    try {
        const result = await mcpClient.callTool("gnfd_create_file", {
            bucketName: RUNBOOKS_BUCKET,
            filePath: tempPath,
            privateKey: process.env.PRIVATE_KEY,
            network: "testnet",
        }) as { objectName?: string; txHash?: string };

        const ref = `gnfd://${RUNBOOKS_BUCKET}/${objectName}`;
        console.log(`[Greenfield] Runbook uploaded: ${ref}`);
        return ref;
    } finally {
        try { unlinkSync(tempPath); } catch (e) { }
    }
}

/**
 * Upload evidence to BNB Greenfield.
 */
export async function uploadEvidence(
    predictionId: number,
    evidenceContent: string
): Promise<string> {
    const objectName = `predict-${predictionId}-evidence.json`;
    const tempPath = join(tmpdir(), objectName);
    writeFileSync(tempPath, evidenceContent);

    try {
        const result = await mcpClient.callTool("gnfd_create_file", {
            bucketName: EVIDENCE_BUCKET,
            filePath: tempPath,
            privateKey: process.env.PRIVATE_KEY,
            network: "testnet",
        }) as { objectName?: string; txHash?: string };

        const ref = `gnfd://${EVIDENCE_BUCKET}/${objectName}`;
        console.log(`[Greenfield] Evidence uploaded: ${ref}`);
        return ref;
    } finally {
        try { unlinkSync(tempPath); } catch (e) { }
    }
}

/**
 * Download a runbook from BNB Greenfield.
 */
export async function downloadRunbook(
    runbookRef: string
): Promise<string> {
    // Expected format: gnfd://bucket-name/object-name.md
    let bucketName = RUNBOOKS_BUCKET;
    let objectName = runbookRef;
    
    if (runbookRef.startsWith("gnfd://")) {
        const parts = runbookRef.replace("gnfd://", "").split("/");
        bucketName = parts[0];
        objectName = parts.slice(1).join("/");
    }

    const result = await mcpClient.callTool("gnfd_download_object", {
        bucketName,
        objectName,
    }) as { body: string };

    return result.body;
}

/**
 * Download evidence from BNB Greenfield.
 */
export async function downloadEvidence(
    predictionId: number
): Promise<string> {
    const objectName = `predict-${predictionId}-evidence.json`;

    const result = await mcpClient.callTool("gnfd_download_object", {
        bucketName: EVIDENCE_BUCKET,
        objectName,
    }) as { body: string };

    return result.body;
}
