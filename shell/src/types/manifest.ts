import type { PlatformType } from "@sewa/host-platform";

/**
 * What `/manifest-registry/registry/manifests/version` answers with.
 *
 * Both fields are optional because the registry currently returns only `id`,
 * while this type originally declared only `version` — see
 * `isStoredVersionCurrent`, which has to cope with either.
 */
export interface ManifestVersion {
  id?: string;
  version?: string;
}

export type OrderByProps = "ASC" | "DESC";

export interface PaginatedMiniAppParamsType {
  size: number;
  orderBy: OrderByProps;
  sortBy: string;
  searchBy?: string;
  search?: string;
  cursor?: string;
}

/**
 * A mini app as listed by the paginated catalog.
 *
 * This is the *browsable* view of a mini app: enough to render a card, and
 * deliberately no `bundleUrl` or `bundleHash`. Those live only in the signed
 * manifest, so nothing loadable can be sourced from this unsigned endpoint.
 */
export interface MiniAppListItem {
  /** Registry row id — also what `cursor` pages on */
  id: string;
  miniAppId: string;
  backingAgencyId?: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
  category?: string;
  version?: string;
  bundleVerifiedAt?: string;
  ingestionStatus?: string;
  ingestionError?: string | null;
  loadStrategy?: string;
  status?: string;
  platform?: PlatformType[];
  rolloutPercentage?: number;
  kycRequired?: boolean;
  metadata?: {
    author?: string;
    environment?: string;
  };
}

/** Cursor pagination state returned alongside each page */
export interface PaginationMeta {
  size: number;
  sortBy: string;
  orderBy: OrderByProps;
  /** Pass back as `cursor` to fetch the next page */
  nextCursor: string | null;
  hasNextPage: boolean;
}

/** One page of the mini-app catalog */
export interface PaginatedMiniApps {
  data: MiniAppListItem[];
  meta: PaginationMeta;
}
