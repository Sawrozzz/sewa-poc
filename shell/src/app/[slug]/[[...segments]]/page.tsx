"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MiniAppContainer } from "@/components/MiniAppContainer";
import { usePlatform } from "@/context";

/**
 * Mini App Loader Page
 *
 * Shell-owned route that loads vendor mini apps via the Runtime Loader.
 * Communication flows through Shell Communicator.
 */
export default function MiniAppLoader() {

  const {appearance} = usePlatform();

  const params = useParams();

    const [isDark, setIsDark] = useState(() => appearance.getTheme().mode === "dark");
  
  const slug = params.slug as string;
  return <MiniAppContainer miniAppId={slug} isDark = {isDark} />;
}
