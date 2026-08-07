import "./globals.css";
import {SerwistProvider} from "@serwist/turbopack/react"
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import type { Metadata, Viewport } from "next";

import GlobalProvider from "@/components/GlobalProvider";
import { InstallPrompt } from "@/components/InstallPrompt"
import { OfflineBanner } from "@/components/OfflineBanner"
import SplashScreen from '@/components/SplashScreen';
import { OfflineProvider } from "@/lib/OfflineContext"

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
        <meta
          content="initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, width=device-width"
          name="viewport"
        />
      </head>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
          <NextIntlClientProvider locale={locale} messages={messages}>
            <OfflineProvider>
              <GlobalProvider>
                <SplashScreen />
                {children}
                <InstallPrompt />
                <OfflineBanner />
              </GlobalProvider>
            </OfflineProvider>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
