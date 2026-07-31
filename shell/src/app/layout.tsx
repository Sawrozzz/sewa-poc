import "./globals.css";
import GloabalProvider from "@/components/GlobalProvider";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import {SerwistProvider} from "@serwist/turbopack/react"
import { InstallPrompt } from "@/components/InstallPrompt"
import { OfflineProvider } from "@/lib/OfflineContext"
import { OfflineBanner } from "@/components/OfflineBanner"

const APP_NAME = "Sewa App";
const APP_DEFAULT_TITLE = "Sewa App";
const APP_TITLE_TEMPLATE = "%s | Sewa App";
const APP_DESCRIPTION = "Your all-in-one super app for Sri Lanka";

export const metadata: Metadata = {
    applicationName: APP_NAME,
    title: {
        default: APP_DEFAULT_TITLE,
        template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: APP_DEFAULT_TITLE,
    },
    formatDetection: {
        telephone: false,
    },
};

export const viewport: Viewport = {
    themeColor: "#3d2806",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <head>
        <title>Government Citizen Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <OfflineProvider>
          <GloabalProvider>
            {children}
            <InstallPrompt />
            <OfflineBanner />
          </GloabalProvider>
          </OfflineProvider>
        </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
