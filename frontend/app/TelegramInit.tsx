"use client";

import { useEffect } from "react";

export default function TelegramInit() {
    useEffect(() => {
        // Check if we are running inside Telegram and the SDK is loaded
        if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) {
            const webApp = window.Telegram.WebApp;

            // Let the Telegram app know we are ready
            webApp.ready();

            // Expand the mini app to take up the full available height
            webApp.expand();
        }
    }, []);

    return null;
}
