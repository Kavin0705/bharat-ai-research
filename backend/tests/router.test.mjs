import test from "node:test";
import assert from "node:assert/strict";
import { chooseStrategy } from "../engine/router.mjs";

test("short low-risk tasks use the lightest strategy", () => {
  const decision = chooseStrategy("Capital of India?");
  assert.equal(decision.strategy, "direct_answer");
  assert.equal(decision.verification, false);
});

test("complex tasks add structured planning and verification", () => {
  const decision = chooseStrategy("Analyze this distributed service failure");
  assert.equal(decision.strategy, "structured_plan");
  assert.equal(decision.verification, true);
});

test("high-risk tasks get a careful plan", () => {
  const decision = chooseStrategy("Review this deployment", "high");
  assert.equal(decision.strategy, "careful_plan");
  assert.equal(decision.verification, true);
});

test("an empty task is not assumed to be simple", () => {
  assert.equal(chooseStrategy("").strategy, "standard_plan");
});