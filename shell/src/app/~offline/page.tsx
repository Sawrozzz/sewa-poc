'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center p-8">
        <div className="text-6xl mb-6">📡</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">You&#39;re Offline</h1>
        <p className="text-gray-600 mb-8">
          It looks like you&#39;re not connected to the internet. Some features may not be available offline.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-gov-500 text-gov-950 px-6 py-3 rounded-lg hover:bg-gov-600 transition font-semibold"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
