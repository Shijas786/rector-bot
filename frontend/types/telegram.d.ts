export { };

declare global {
    interface Window {
        Telegram?: {
            WebApp: {
                ready: () => void;
                expand: () => void;
                close: () => void;
                initDataUnsafe: any;
            };
        };
    }
}
