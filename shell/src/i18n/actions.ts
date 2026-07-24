"use server";

import { cookies } from "next/headers";
import { isValidLocale } from "./config";

export async function setLocale(locale: string) {
  if (!isValidLocale(locale)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
