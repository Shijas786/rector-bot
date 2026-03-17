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
        console.log(`[Greenfield] Attempting upload: ${objectName}`);
        const result = await mcpClient.callTool("gnfd_create_file", {
            bucketName: RUNBOOKS_BUCKET,
            filePath: tempPath,
            privateKey: process.env.PRIVATE_KEY,
            network: "testnet",
        }) as any;

        if (!result) throw new Error("MCP tool 'gnfd_create_file' returned no result");

        // Handle JSON error strings from MCP
        if (typeof result === "string") {
            try {
                const parsed = JSON.parse(result);
                if (parsed.status === "error") throw new Error(parsed.message);
            } catch (e: any) {
                if (e.message.includes("error")) throw e;
            }
        }

        if (result.status === "error") throw new Error(result.message || "Unknown Greenfield upload error");

        const ref = `gnfd://${RUNBOOKS_BUCKET}/${objectName}`;
        console.log(`[Greenfield] Upload success: ${ref}`);
        return ref;
    } catch (error: any) {
        console.error(`[Greenfield ERROR] Failed to upload runbook:`, error.message);
        if (error.message.includes("account") && error.message.includes("not found")) {
            throw new Error(`STORAGE ACCOUNT NOT INITIALIZED\n━━━━━━━━━━━━━━━━━━━━\nYour storage account (PRIVATE_KEY) is not found on Greenfield Testnet.\n\n📍 **ACTION REQUIRED:**\nPlease send some BNB to your protocol wallet on BNB Smart Chain and then visit the Greenfield Testnet Bridge to initialize it.\n\nAccount: 0x1813e0e8E19bAeCf5F9B21676b21CbBAf7836f8c (Found in rpc error)`);
        }
        throw new Error(`[RECTOR STORAGE ERROR]: ${error.message}`);
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
        }) as any;

        if (typeof result === "string") {
            try {
                const parsed = JSON.parse(result);
                if (parsed.status === "error") throw new Error(parsed.message);
                return `gnfd://${EVIDENCE_BUCKET}/${parsed.objectName || objectName}`;
            } catch (e: any) {
                if (e.message.includes("error")) throw e;
            }
        }

        const ref = `gnfd://${EVIDENCE_BUCKET}/${result?.objectName || objectName}`;
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
        bucketName = parts.shift() || RUNBOOKS_BUCKET;
        objectName = parts.join("/");
    }

    console.log(`[Greenfield] Downloading -> Bucket: ${bucketName} | Object: ${objectName}`);

    const result = await mcpClient.callTool("gnfd_download_object", {
        bucketName,
        objectName,
        network: "testnet"
    }) as any;

    if (typeof result === "string") {
        try {
            const parsed = JSON.parse(result);
            if (parsed.status === "error") throw new Error(parsed.message);
            return parsed.body || result; 
        } catch {
            return result;
        }
    }
    
    if (result?.status === "error") throw new Error(result.message);
    return result?.body || "";
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
        network: "testnet"
    }) as any;

    if (typeof result === "string") {
        try {
            const parsed = JSON.parse(result);
            if (parsed.status === "error") throw new Error(parsed.message);
            return parsed.body || result; 
        } catch {
            return result;
        }
    }
    
    if (result?.status === "error") throw new Error(result.message);
    return result?.body || "";
}
