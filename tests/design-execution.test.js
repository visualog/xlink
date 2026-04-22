import test from "node:test";
import assert from "node:assert/strict";

import { buildCompletionAssessment, buildExecutionPlan } from "../src/design-execution.js";

test("buildExecutionPlan derives stage and ordered steps from design intent", () => {
  const plan = buildExecutionPlan({
    designIntent: {
      fileKey: "FILE_123",
      nodeId: "817:417",
      designGoal: "히어로 메시지를 더 직접적으로 만든다.",
      constraints: ["CTA 유지"],
      acceptanceCriteria: ["CTA 유지", "카피 축약"]
    },
    blockers: [],
    deliverables: []
  });

  assert.equal(plan.stage, "design-pass");
  assert.equal(plan.steps[0].id, "load-target");
  assert.equal(plan.steps[3].id, "verify-criteria");
});

test("buildCompletionAssessment reports ready-for-review when deliverable exists and criteria are mentioned", () => {
  const assessment = buildCompletionAssessment({
    designIntent: {
      acceptanceCriteria: ["CTA 유지", "카피 축약"]
    },
    blockers: [],
    deliverables: [{ type: "figma", path: "/tmp/landing.fig" }],
    messageBodies: ["기존 CTA 유지", "헤드라인 카피 축약 적용 완료"]
  });

  assert.equal(assessment.status, "ready-for-review");
  assert.equal(assessment.matchedCriteria, 2);
  assert.equal(assessment.missing.length, 0);
});
