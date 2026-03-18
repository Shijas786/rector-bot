import 'dotenv/config';
import fetch from 'node-fetch';

const ZERION_API_KEY = process.env.ZERION_API_KEY || "";
const address = "0x6c31212a23040998e1d1c157ace3982abdbe3154";

async function test() {
    console.log("Testing Zerion API...");
    console.log("Key:", ZERION_API_KEY.substring(0, 5) + "...");
    
    const auth = Buffer.from(ZERION_API_KEY + ":").toString("base64");
    const url = `https://api.zerion.io/v1/wallets/${address}/portfolio`;
    
    console.log("URL:", url);
    
    const res = await fetch(url, {
        headers: {
            "accept": "application/json",
            "authorization": `Basic ${auth}`,
        }
    });
    
    console.log("Status:", res.status, res.statusText);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
}

test().catch(console.error);
