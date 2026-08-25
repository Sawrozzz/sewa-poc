import type { MetaDataType, ModuleManifest } from "@sewa/host-platform";
import { resolveDataCapabilities, resolveMiniAppCapabilities } from "@sewa/host-platform";
import type { MiniAppListItem } from "@/types/manifest";

export type ResolvedMiniApp = MiniAppListItem &
  Omit<ModuleManifest, "id" | "bundleVerifiedAt" | "metaData"> & {
    bundleVerifiedAt?: string;
    metaData?: MetaDataType;
    mergedCapabilities: string[];
  };

const SIGNED_ONLY_FIELDS = [
  "bundleUrl",
  "bundleHash",
  "sdkVersionRequired",
  "integrity",
  "signature",
] as const;

function withoutSignedOnlyFields(listItem: MiniAppListItem): MiniAppListItem {
  const safe: Record<string, unknown> = { ...listItem };
  for (const field of SIGNED_ONLY_FIELDS) delete safe[field];
  return safe as unknown as MiniAppListItem;
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function mergeMiniApp(listItem: MiniAppListItem, entry: ModuleManifest): ResolvedMiniApp {
  const { bundleVerifiedAt, ...rest } = entry;

  const merged = {
    ...withoutSignedOnlyFields(listItem),
    ...definedOnly(rest),
    ...(bundleVerifiedAt === undefined
      ? {}
      : {
          bundleVerifiedAt:
            typeof bundleVerifiedAt === "string"
              ? bundleVerifiedAt
              : bundleVerifiedAt.toISOString(),
        }),
  } as ResolvedMiniApp;
  merged.mergedCapabilities = [...resolveDataCapabilities(merged), ...resolveMiniAppCapabilities(merged) ];

  return merged;
}

export function indexManifestMiniApps(
  miniApps: ModuleManifest[] | undefined,
): Map<string, ModuleManifest> {
  return new Map((miniApps ?? []).map((app) => [app.miniAppId, app]));
}
