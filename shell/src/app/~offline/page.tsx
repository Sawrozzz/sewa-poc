export default function OfflinePage() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                You are offline
            </h1>
            <p className="max-w-md text-zinc-600 dark:text-zinc-400">
                Check your connection and try again. Cached pages may still be available.
            </p>
        </div>
    );
}
