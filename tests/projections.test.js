import test from "node:test";
import assert from "node:assert/strict";

import { projectHandoff } from "../src/projections.js";

test("projectHandoff figma brief includes normalized figma intent", () => {
  const projection = projectHandoff({
    id: "handoff_001",
    threadId: "thread_001",
    channel: "figma",
    title: "Hero redesign",
    status: "pending",
    priority: "high",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    createdAt: "2026-04-22T10:00:00.000Z",
    payload: {
      type: "screen-update",
      title: "Hero redesign",
      date: "2026-04-22",
      summary: "히어로 메시지를 더 강하게 만든다.",
      details: ["기존 CTA 유지"],
      tags: ["hero"],
      files: ["Landing.fig"],
      figmaFileKey: "FILE_123",
      nodeId: "817:417",
      screenName: "Landing Hero",
      designGoal: "메시지 우선순위를 더 명확히 한다.",
      acceptanceCriteria: ["CTA 유지", "카피 축약"],
      references: ["https://example.com/reference"]
    },
    artifacts: [
      { type: "figma", path: "/tmp/landing.fig", label: "landing" }
    ]
  });

  assert.equal(projection.kind, "figma-brief");
  assert.equal(projection.data.threadId, "thread_001");
  assert.equal(projection.data.figmaIntent.fileKey, "FILE_123");
  assert.equal(projection.data.figmaIntent.nodeId, "817:417");
  assert.equal(projection.data.figmaIntent.acceptanceCriteria.length, 2);
  assert.equal(projection.data.figmaIntent.referenceArtifacts.length, 1);
});
