"use client";

import {useState} from "react";
import {LocaleSwitcher} from "./LanguageSwitcher";
import {useTranslations} from "next-intl";

export function LoginForm({onLoginSuccessAction}: { onLoginSuccessAction: () => void }) {
    const t = useTranslations("LoginPage");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/ropc-login", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    username: email,
                    password,
                    clientId: "mock-client",
                    providerId: "mock-provider",
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                setError(text || "Login failed");
                return;
            }

            onLoginSuccessAction();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
            <div className="w-full max-w-md animate-fade-in">
                <LocaleSwitcher/>
                {/* Header */}
                <div className="text-center mb-8">
                    <div
                        className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
                        <span className="text-4xl">🏛️</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1">
                        {t("portal_title")}
                    </h1>
                    <p className="text-gov-300 text-sm">
                        Access all government services in one place
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-xl shadow-2xl p-8">
                    <h2 className="text-lg font-semibold text-gray-800 mb-1">
                        Citizen Login
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">
                        Sign in with your government credentials
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email / Username
                            </label>
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-500 focus:border-gov-500 outline-none transition"
                                placeholder="citizen@gov.np"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-500 focus:border-gov-500 outline-none transition"
                                placeholder="Enter your password"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-gov-600 hover:bg-gov-700 disabled:bg-gov-400 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <span
                                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                    Authenticating...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-6 text-gov-400 text-xs">
                    <p>Government of Nepal | Digital Transformation Initiative</p>
                    <p className="mt-1">
                        <a href="#" className="hover:text-white transition">
                            Privacy Policy
                        </a>
                        {" · "}
                        <a href="#" className="hover:text-white transition">
                            Help Center
                        </a>
                        {" · "}
                        <a href="#" className="hover:text-white transition">
                            Accessibility
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
