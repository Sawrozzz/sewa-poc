import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { bundleFetchUrl, findMiniApp } from "./modules-api";
import type { SignedMiniAppManifest } from "@sewa/host-platform";

describe("modules-api", () => {
  it("findMiniApp locates entry by miniAppId", () => {
    const manifest = {
      id: "v1",
      publishedAt: new Date().toISOString(),
      miniApps: [
        { miniAppId: "a", sdkVersionRequired: "1.0.0", platform: ["web"], kycRequired: false, bundleUrl: "https://cdn/a.zip", bundleHash: "sha256-abc" },
        { miniAppId: "b", sdkVersionRequired: "1.0.0", platform: ["web"], kycRequired: false },
      ],
      algorithm: "RS256",
      keyId: "k1",
      signature: "sig",
    } as unknown as SignedMiniAppManifest;
    assert.equal(findMiniApp(manifest, "a")?.miniAppId, "a");
    assert.equal(findMiniApp(manifest, "missing"), null);
    assert.equal(findMiniApp(undefined, "a"), null);
  });

  it("bundleFetchUrl validates protocol and proxies", () => {
    const proxied = bundleFetchUrl("https://cdn.test/app.zip");
    assert.ok(proxied.includes("/api/manifests/bundle?url="));
    assert.throws(() => bundleFetchUrl("javascript:alert(1)"), /Unsupported protocol/);
    assert.throws(() => bundleFetchUrl(""), /bundleUrl is required/);
    assert.throws(() => bundleFetchUrl("not-a-url"), /Invalid bundleUrl/);
  });

  it("bundleFetchUrl respects NEXT_PUBLIC_BUNDLE_PROXY=off", () => {
    const orig = process.env.NEXT_PUBLIC_BUNDLE_PROXY;
    process.env.NEXT_PUBLIC_BUNDLE_PROXY = "off";
    const direct = bundleFetchUrl("https://cdn.test/app.zip");
    assert.equal(direct, "https://cdn.test/app.zip");
    process.env.NEXT_PUBLIC_BUNDLE_PROXY = orig;
  });
});
