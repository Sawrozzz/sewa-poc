import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  it("exposes debug/info/warn/error", () => {
    assert.equal(typeof logger.debug, "function");
    assert.equal(typeof logger.info, "function");
    assert.equal(typeof logger.warn, "function");
    assert.equal(typeof logger.error, "function");
  });

  it("does not throw on log calls", () => {
    assert.doesNotThrow(() => logger.info("test", { a: 1 }));
    assert.doesNotThrow(() => logger.warn("warn"));
    assert.doesNotThrow(() => logger.error("err", { code: "E1" }));
    assert.doesNotThrow(() => logger.debug("dbg"));
  });
});
