import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuleManifest } from "@sewa/host-platform";
import { CORE_CAPABILITIES } from "@sewa/host-platform";
import type { MiniAppListItem } from "@/types/manifest";
import { indexManifestMiniApps, mergeMiniApp } from "./merge-mini-app";

/** A catalog row, including the extra keys an unsigned endpoint could add. */
function makeRow(overrides: Record<string, unknown> = {}): MiniAppListItem {
  return {
    id: "row-1",
    miniAppId: "passport",
    displayName: "Passport Services",
    description: "from catalog",
    iconUrl: "https://cdn.test/icon.png",
    category: "Travel",
    metadata: { author: "dept", environment: "prod" },
    ...overrides,
  } as MiniAppListItem;
}

function makeEntry(overrides: Record<string, unknown> = {}): ModuleManifest {
  return {
    miniAppId: "passport",
    description: "from manifest",
    bundleUrl: "https://cdn.test/passport.zip",
    bundleHash: "sha256-abc",
    sdkVersionRequired: "1.2.0",
    platform: ["web"],
    kycRequired: true,
    metaData: { author: "registry", environment: "prod" },
    ...overrides,
  } as ModuleManifest;
}

test("mergeMiniApp keeps the fields only one side carries", () => {
  const merged = mergeMiniApp(makeRow(), makeEntry());

  assert.equal(merged.id, "row-1");
  assert.equal(merged.iconUrl, "https://cdn.test/icon.png");
  assert.equal(merged.category, "Travel");
  assert.equal(merged.bundleHash, "sha256-abc");
  assert.equal(merged.sdkVersionRequired, "1.2.0");
  assert.equal(merged.kycRequired, true);
});

test("mergeMiniApp lets the manifest win where it has a value", () => {
  const merged = mergeMiniApp(makeRow(), makeEntry());

  assert.equal(merged.description, "from manifest");
});

test("mergeMiniApp does not let an absent manifest value blank a catalog one", () => {
  const merged = mergeMiniApp(makeRow(), makeEntry({ displayName: undefined }));

  assert.equal(merged.displayName, "Passport Services");
});

test("mergeMiniApp never takes a signed-only field from the catalog", () => {
  const merged = mergeMiniApp(
    makeRow({ bundleUrl: "https://evil.test/app.zip", sdkVersionRequired: "9.9.9" }),
    makeEntry(),
  );

  assert.equal(merged.bundleUrl, "https://cdn.test/passport.zip");
  assert.equal(merged.sdkVersionRequired, "1.2.0");
});

test("mergeMiniApp takes capabilities from the catalog, which is where the registry publishes them", () => {
  const merged = mergeMiniApp(
    makeRow({ capabilities: ["device.location", "http"] }),
    makeEntry({ capabilities: undefined }),
  );

  assert.deepEqual(merged.capabilities, ["device.location", "http"]);
});

test("mergeMiniApp prefers the manifest's capabilities once it publishes them", () => {
  const merged = mergeMiniApp(
    makeRow({ capabilities: ["*"] }),
    makeEntry({ capabilities: ["device.location"] }),
  );

  assert.deepEqual(merged.capabilities, ["device.location"]);
});

test("mergeMiniApp normalises bundleVerifiedAt to a string", () => {
  const merged = mergeMiniApp(
    makeRow(),
    makeEntry({ bundleVerifiedAt: new Date("2026-01-02T03:04:05.000Z") }),
  );

  assert.equal(merged.bundleVerifiedAt, "2026-01-02T03:04:05.000Z");
});

test("indexManifestMiniApps indexes by miniAppId and tolerates no manifest", () => {
  const entry = makeEntry();

  assert.equal(indexManifestMiniApps([entry]).get("passport"), entry);
  assert.equal(indexManifestMiniApps(undefined).size, 0);
});

test("mergedCapabilities is the declared list plus the core namespaces", () => {
  const merged = mergeMiniApp(makeRow({ capabilities: ["device.location"] }), makeEntry());

  for (const core of CORE_CAPABILITIES) {
    assert.ok(merged.mergedCapabilities.includes(core), `missing core capability ${core}`);
  }
  assert.ok(merged.mergedCapabilities.includes("device.location"));
  // The declared list is left as the registry published it.
  assert.deepEqual(merged.capabilities, ["device.location"]);
});

test("mergedCapabilities is the core set alone when the app declares nothing", () => {
  const merged = mergeMiniApp(makeRow({ capabilities: [] }), makeEntry());

  assert.deepEqual([...merged.mergedCapabilities].sort(), [...CORE_CAPABILITIES].sort());
});

test("mergedCapabilities de-duplicates a core namespace the app also declares", () => {
  const merged = mergeMiniApp(makeRow({ capabilities: ["auth", "auth", "http"] }), makeEntry());

  assert.equal(merged.mergedCapabilities.filter((c) => c === "auth").length, 1);
});
