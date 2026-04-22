import test from "node:test";
import assert from "node:assert/strict";

import { parseStreamInterval } from "../src/sse.js";

test("parseStreamInterval clamps too-small values to 250ms", () => {
  assert.equal(parseStreamInterval("1"), 250);
});

test("parseStreamInterval falls back on invalid values", () => {
  assert.equal(parseStreamInterval("0"), 2000);
  assert.equal(parseStreamInterval("abc"), 2000);
});

test("parseStreamInterval clamps max to 30000ms", () => {
  assert.equal(parseStreamInterval("999999"), 30000);
});
