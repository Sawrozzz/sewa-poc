/**
 * TESTING ONLY — a stand-in capability grant for registry mini apps.
 *
 * The manifest registry API still returns `capabilities: []` for every mini
 * app, and an empty grant means the app can reach nothing but the core
 * lifecycle namespaces. Until the API ships real values, a manifest that
 * declares nothing gets this list stamped onto `customCapabilities`, which the
 * host merges on top of whatever the manifest declared.
 *
 * Edit this list to exercise the gate: `sdk.device.location()` works because
 * `device.location` is granted, while `sdk.device.contact()` comes back as
 * PERMISSION_DENIED because `device.contact` is not. Use `["*"]` to grant
 * everything.
 *
 * Delete this file — and the `customCapabilities` field — once the registry
 * serves capabilities.
 */
export const TESTING_CAPABILITIES: string[] = [
  "http",
  "api",
  "auth",
  "device.location",
  "device.camera",
  "device.files",
  "device.contact",
];

/** The two capability lists any manifest shape carries. */
interface CapabilityFields {
  capabilities?: string[];
  customCapabilities?: string[];
}

/**
 * Stamps {@link TESTING_CAPABILITIES} onto a manifest that grants nothing.
 * A manifest that already declares capabilities is returned untouched, so the
 * pre-installed mini apps keep exactly the grant they ship with.
 */
export function withTestingCapabilities<T extends CapabilityFields>(manifest: T): T {
  const declared = manifest.capabilities ?? [];
  if (declared.length > 0 || (manifest.customCapabilities?.length ?? 0) > 0) return manifest;
  return { ...manifest, customCapabilities: TESTING_CAPABILITIES };
}
