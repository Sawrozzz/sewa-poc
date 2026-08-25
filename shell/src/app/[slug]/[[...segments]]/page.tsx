"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { MiniAppSource } from "@/components/mini-app/MiniAppContainer";
import { MiniAppContainer } from "@/components/mini-app/MiniAppContainer";
import Loader from "@/components/ui/Loader";
import { usePlatform } from "@/context";

/**
 * Mini App Loader Page
 *
 * Shell-owned route that loads vendor mini apps via the Runtime Loader.
 * Communication flows through Shell Communicator.
 *
 * `?source=registry` opens the mini app through the signed manifest (a
 * hash-verified `.zip`); without it the pre-installed descriptor is used. The
 * two lists can carry the same id, so the source has to be explicit.
 */
function MiniAppRoute() {
  const { appearance } = usePlatform();

  const params = useParams();
  const searchParams = useSearchParams();

  const [isDark] = useState(() => appearance.getTheme().mode === "dark");

  const slug = params.slug as string;
  const source: MiniAppSource = searchParams.get("source") === "registry" ? "registry" : "fallback";

  return <MiniAppContainer isDark={isDark} miniAppId={slug} source={source} />;
}

export default function MiniAppLoader() {
  return (
    <Suspense fallback={<Loader />}>
      <MiniAppRoute />
    </Suspense>
  );
}
