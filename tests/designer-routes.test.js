import test from "node:test";
import assert from "node:assert/strict";

import { createDesignerRoutes } from "../src/routes/designer.js";
import { createReviewRoutes } from "../src/routes/review.js";
import { createThreadRoutes } from "../src/routes/threads.js";

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writableEnded: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body += body;
      this.writableEnded = true;
    }
  };
}

function makeJsonRequest(payload) {
  return {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(payload), "utf8");
    }
  };
}

function makeStore() {
  return {
    async listThreads(filters = {}) {
      const threads = [
        {
          id: "thread_2026_04_22_001",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "Hero redesign",
          status: "open",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:05:00.000Z",
          handoffIds: ["handoff_2026_04_22_001"],
          messages: [
            {
              author: "planner-agent",
              body: "히어로를 더 강하게 바꿔주세요.",
              kind: "note",
              createdAt: "2026-04-22T10:05:00.000Z"
            }
          ]
        }
      ];
      return threads.filter((thread) => (!filters.channel || thread.channel === filters.channel)
        && (!filters.targetAgent || thread.targetAgent === filters.targetAgent));
    },
    async list(filters = {}) {
      const handoffs = [
        {
          id: "handoff_2026_04_22_001",
          threadId: "thread_2026_04_22_001",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "Hero redesign",
          status: "pending",
          priority: "high",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:06:00.000Z",
          claimedAt: null,
          completedAt: null,
          claimedBy: null,
          payload: {
            type: "figma_task",
            title: "Hero redesign",
            date: "2026-04-22",
            summary: "제품 핵심 가치를 더 명확히 보이게 한다.",
            details: ["강한 헤드라인", "CTA 개선"],
            tags: ["hero", "landing"],
            files: ["Landing.fig"],
            figmaFileKey: "FILE_123",
            nodeId: "817:417",
            screenName: "Landing Hero",
            designGoal: "히어로 메시지를 더 직접적으로 만든다.",
            acceptanceCriteria: ["CTA 유지", "헤드라인 축약"]
          },
          artifacts: [],
          messages: [
            {
              author: "planner-agent",
              body: "히어로를 더 강하게 바꿔주세요.",
              kind: "note",
              createdAt: "2026-04-22T10:06:00.000Z"
            }
          ]
        },
        {
          id: "handoff_2026_04_22_002",
          threadId: "thread_2026_04_22_002",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "Completed task",
          status: "completed",
          priority: "medium",
          createdAt: "2026-04-22T08:00:00.000Z",
          updatedAt: "2026-04-22T08:30:00.000Z",
          claimedAt: "2026-04-22T08:05:00.000Z",
          completedAt: "2026-04-22T08:30:00.000Z",
          claimedBy: "designer-agent",
          payload: {
            type: "figma_task",
            title: "Completed task",
            date: "2026-04-22",
            summary: "done",
            details: ["done"],
            tags: ["done"],
            files: []
          },
          artifacts: [],
          messages: []
        }
      ];
      return handoffs.filter((handoff) => (!filters.channel || handoff.channel === filters.channel)
        && (!filters.targetAgent || handoff.targetAgent === filters.targetAgent));
    },
    async getMailboxReadState() {
      return {
        agent: "designer-agent",
        threadId: null,
        lastReadAt: "2026-04-22T09:59:00.000Z",
        globalLastReadAt: "2026-04-22T09:59:00.000Z",
        threadLastReadAt: null,
        updatedAt: "2026-04-22T09:59:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    }
  };
}

test("GET /designer/context returns figma designer context summary", async () => {
  const route = createDesignerRoutes(
    makeStore(),
    new Map([
      ["figma", {
        async listEntries() {
          return {
            channel: "figma",
            updatedAt: "2026-04-22",
            entries: [
              {
                id: "handoff_2026_04_22_001",
                kind: "figma-brief",
                data: {
                  id: "handoff_2026_04_22_001",
                  title: "Hero redesign",
                  status: "pending",
                  priority: "high",
                  createdAt: "2026-04-22T09:00:00.000Z",
                  sourceAgent: "planner-agent",
                  targetAgent: "designer-agent",
                  payload: {
                    summary: "제품 핵심 가치를 더 명확히 보이게 한다.",
                    tags: ["hero"],
                    files: ["Landing.fig"]
                  },
                  figmaIntent: {
                    fileKey: "FILE_123",
                    nodeId: "817:417",
                    screenName: "Landing Hero",
                    designGoal: "히어로 메시지를 더 직접적으로 만든다.",
                    acceptanceCriteria: ["CTA 유지", "헤드라인 축약"]
                  },
                  deliverables: [
                    { type: "figma", path: "/tmp/landing.fig", label: "landing" }
                  ]
                }
              }
            ]
          };
        }
      }]
    ])
  );
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.context.channel, "figma");
  assert.equal(payload.context.summary.unreadThreads, 1);
  assert.equal(payload.context.focusThread.id, "thread_2026_04_22_001");
  assert.equal(payload.context.focusIntent.fileKey, "FILE_123");
  assert.equal(payload.context.focusIntent.nodeId, "817:417");
  assert.equal(payload.context.summary.focusExecutionStage, "verify-and-handoff");
  assert.equal(payload.context.summary.focusAssessmentStatus, "needs-verification");
  assert.equal(payload.context.focusExecutionPlan.stage, "verify-and-handoff");
  assert.equal(payload.context.focusAssessment.status, "needs-verification");
  assert.equal(payload.context.nextActions[0].type, "review-unread-thread");
  assert.equal(payload.context.nextVerification[0].type, "verify-criterion");
  assert.equal(payload.context.workQueue[0].threadId, "thread_2026_04_22_001");
  assert.equal(payload.context.workQueue[0].assessmentStatus, "needs-verification");
  assert.equal(payload.context.workQueue[0].executionStage, "verify-and-handoff");
  assert.equal(payload.context.workQueue[0].nextStep, "review-feedback");
  assert.equal(payload.context.handoffs.length, 1);
  assert.equal(payload.context.briefs[0].id, "handoff_2026_04_22_001");
  assert.equal(payload.context.briefs[0].figmaIntent.screenName, "Landing Hero");
});

test("GET /designer/context excludes closed handoffs by default and can include them", async () => {
  const route = createDesignerRoutes(makeStore(), new Map());

  const defaultResponse = makeResponseCapture();
  const defaultUrl = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");
  await route({ method: "GET" }, defaultResponse, defaultUrl);
  const defaultPayload = JSON.parse(defaultResponse.body);

  assert.equal(defaultPayload.context.handoffs.length, 1);
  assert.equal(defaultPayload.context.handoffs[0].status, "pending");

  const includeClosedResponse = makeResponseCapture();
  const includeClosedUrl = new URL(
    "http://127.0.0.1:3850/designer/context?agent=designer-agent&includeClosed=true"
  );
  await route({ method: "GET" }, includeClosedResponse, includeClosedUrl);
  const includeClosedPayload = JSON.parse(includeClosedResponse.body);

  assert.equal(includeClosedPayload.context.handoffs.length, 2);
});

test("GET /designer/context prioritizes threads that still need design work over ready-for-review threads", async () => {
  const store = {
    async listThreads() {
      return [
        {
          id: "thread_design_pass",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "New hero draft",
          status: "open",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:02:00.000Z",
          handoffIds: ["handoff_design_pass"],
          messages: []
        },
        {
          id: "thread_ready_review",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "Pricing banner polish",
          status: "open",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:10:00.000Z",
          handoffIds: ["handoff_ready_review"],
          messages: []
        }
      ];
    },
    async list() {
      return [
        {
          id: "handoff_design_pass",
          threadId: "thread_design_pass",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "New hero draft",
          status: "claimed",
          priority: "high",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:02:00.000Z",
          claimedAt: "2026-04-22T09:10:00.000Z",
          completedAt: null,
          claimedBy: "designer-agent",
          payload: {
            summary: "히어로 초안을 새로 만든다.",
            designGoal: "핵심 가치 전달이 더 직접적인 히어로를 만든다.",
            acceptanceCriteria: ["CTA 유지"]
          },
          artifacts: [],
          messages: []
        },
        {
          id: "handoff_ready_review",
          threadId: "thread_ready_review",
          channel: "figma",
          sourceAgent: "planner-agent",
          targetAgent: "designer-agent",
          title: "Pricing banner polish",
          status: "claimed",
          priority: "medium",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T10:10:00.000Z",
          claimedAt: "2026-04-22T09:20:00.000Z",
          completedAt: null,
          claimedBy: "designer-agent",
          payload: {
            summary: "배너 마감 다듬기",
            designGoal: "배너를 정리하고 마감 품질을 높인다.",
            acceptanceCriteria: ["CTA 유지"]
          },
          artifacts: [
            {
              type: "figma",
              path: "/tmp/pricing.fig",
              label: "pricing"
            }
          ],
          messages: [
            {
              author: "designer-agent",
              body: "CTA 유지 반영 완료",
              kind: "reply",
              createdAt: "2026-04-22T10:10:00.000Z"
            }
          ]
        }
      ];
    },
    async getMailboxReadState() {
      return {
        agent: "designer-agent",
        threadId: null,
        lastReadAt: "2026-04-22T10:20:00.000Z",
        globalLastReadAt: "2026-04-22T10:20:00.000Z",
        threadLastReadAt: null,
        updatedAt: "2026-04-22T10:20:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    }
  };
  const route = createDesignerRoutes(store, new Map());
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.context.focusThread.id, "thread_design_pass");
  assert.equal(payload.context.focusAssessment.status, "needs-design-pass");
  assert.equal(payload.context.workQueue[0].threadId, "thread_design_pass");
  assert.equal(payload.context.workQueue[0].assessmentStatus, "needs-design-pass");
  assert.equal(payload.context.workQueue[0].nextStep, "attach-deliverable");
  assert.equal(payload.context.workQueue[1].threadId, "thread_ready_review");
  assert.equal(payload.context.workQueue[1].assessmentStatus, "ready-for-review");
  assert.equal(payload.context.workQueue[1].executionStage, "verify-and-handoff");
});

test("thread deliverables and verification write-backs change designer context queue and verification state", async () => {
  const thread = {
    id: "thread_writeback",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Hero rewrite",
    status: "open",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    handoffIds: ["handoff_writeback"],
    messages: []
  };
  const handoff = {
    id: "handoff_writeback",
    threadId: "thread_writeback",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Hero rewrite",
    status: "claimed",
    priority: "high",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    claimedAt: "2026-04-22T09:10:00.000Z",
    completedAt: null,
    claimedBy: "designer-agent",
    payload: {
      summary: "히어로 메시지를 더 직접적으로 만든다.",
      designGoal: "짧은 헤드라인과 유지된 CTA로 히어로를 재구성한다.",
      acceptanceCriteria: ["CTA 유지"]
    },
    artifacts: [],
    messages: []
  };
  const secondaryThread = {
    id: "thread_secondary",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Secondary cleanup",
    status: "open",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T09:30:00.000Z",
    handoffIds: ["handoff_secondary"],
    messages: []
  };
  const secondaryHandoff = {
    id: "handoff_secondary",
    threadId: "thread_secondary",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Secondary cleanup",
    status: "claimed",
    priority: "medium",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T09:30:00.000Z",
    claimedAt: "2026-04-22T09:20:00.000Z",
    completedAt: null,
    claimedBy: "designer-agent",
    payload: {
      summary: "작은 정리 작업",
      designGoal: "보조 배너를 정리한다."
    },
    artifacts: [],
    messages: []
  };
  const threads = [thread, secondaryThread];
  const handoffs = [handoff, secondaryHandoff];
  const store = {
    async listThreads(filters = {}) {
      return threads.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.id === filters.threadId));
    },
    async list(filters = {}) {
      return handoffs.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.threadId === filters.threadId));
    },
    async getThreadById(id) {
      return threads.find((item) => item.id === id);
    },
    async getMailboxReadState() {
      return {
        agent: "designer-agent",
        threadId: null,
        lastReadAt: "2026-04-22T10:30:00.000Z",
        globalLastReadAt: "2026-04-22T10:30:00.000Z",
        threadLastReadAt: null,
        updatedAt: "2026-04-22T10:30:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    },
    async addArtifact(id, input) {
      const target = handoffs.find((item) => item.id === id);
      target.artifacts.push({
        ...input,
        createdAt: "2026-04-22T10:31:00.000Z"
      });
      target.updatedAt = "2026-04-22T10:31:00.000Z";
      thread.updatedAt = "2026-04-22T10:31:00.000Z";
      return target;
    },
    async appendMessage(id, input) {
      const target = handoffs.find((item) => item.id === id);
      target.messages.push({
        ...input,
        createdAt: "2026-04-22T10:32:00.000Z"
      });
      target.updatedAt = "2026-04-22T10:32:00.000Z";
      thread.updatedAt = "2026-04-22T10:32:00.000Z";
      return target;
    }
  };
  const threadRoute = createThreadRoutes(store, new Map());
  const designerRoute = createDesignerRoutes(store, new Map());

  const deliverableResponse = makeResponseCapture();
  const deliverableUrl = new URL("http://127.0.0.1:3850/threads/thread_writeback/deliverables");
  await threadRoute(
    makeJsonRequest({
      agent: "designer-agent",
      artifacts: [{ type: "figma", path: "/tmp/hero.fig", label: "hero" }]
    }),
    deliverableResponse,
    deliverableUrl,
    ["threads", "thread_writeback", "deliverables"]
  );

  const afterDeliverableResponse = makeResponseCapture();
  const designerUrl = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");
  await designerRoute({ method: "GET" }, afterDeliverableResponse, designerUrl);
  const afterDeliverablePayload = JSON.parse(afterDeliverableResponse.body);

  assert.equal(afterDeliverablePayload.context.focusThread.id, "thread_writeback");
  assert.equal(afterDeliverablePayload.context.workQueue[0].threadId, "thread_writeback");
  assert.equal(afterDeliverablePayload.context.workQueue[0].hasDeliverable, true);
  assert.equal(
    afterDeliverablePayload.context.nextVerification.every((item) => item.type !== "attach-deliverable"),
    true
  );

  const verificationResponse = makeResponseCapture();
  const verificationUrl = new URL("http://127.0.0.1:3850/threads/thread_writeback/verification");
  await threadRoute(
    makeJsonRequest({
      agent: "designer-agent",
      status: "ready-for-review",
      criteria: [{ text: "CTA 유지", status: "pass" }],
      note: "CTA 유지 확인"
    }),
    verificationResponse,
    verificationUrl,
    ["threads", "thread_writeback", "verification"]
  );

  const afterVerificationResponse = makeResponseCapture();
  await designerRoute({ method: "GET" }, afterVerificationResponse, designerUrl);
  const afterVerificationPayload = JSON.parse(afterVerificationResponse.body);

  assert.equal(afterVerificationPayload.context.focusThread.id, "thread_writeback");
  assert.equal(afterVerificationPayload.context.focusAssessment.status, "ready-for-review");
  assert.equal(afterVerificationPayload.context.workQueue[0].threadId, "thread_writeback");
  assert.equal(
    afterVerificationPayload.context.nextVerification.some((item) => ["verify-criterion", "attach-deliverable"].includes(item.type)),
    false
  );
});

test("GET /designer/context hides quiet threads that no longer have actionable designer handoffs", async () => {
  const route = createDesignerRoutes(
    {
      async listThreads() {
        return [
          {
            id: "thread_quiet",
            channel: "figma",
            sourceAgent: "planner-agent",
            targetAgent: "designer-agent",
            title: "Quiet thread",
            status: "open",
            createdAt: "2026-04-22T09:00:00.000Z",
            updatedAt: "2026-04-22T09:10:00.000Z",
            handoffIds: ["handoff_review_only"],
            messages: []
          }
        ];
      },
      async list() {
        return [];
      },
      async getMailboxReadState() {
        return {
          agent: "designer-agent",
          threadId: null,
          lastReadAt: "2026-04-22T10:00:00.000Z",
          globalLastReadAt: "2026-04-22T10:00:00.000Z",
          threadLastReadAt: null,
          updatedAt: "2026-04-22T10:00:00.000Z"
        };
      },
      async listMailboxReadStates() {
        return [];
      }
    },
    new Map()
  );
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.context.summary.threadCount, 0);
  assert.equal(payload.context.threads.length, 0);
  assert.equal(payload.context.workQueue.length, 0);
  assert.equal(payload.context.focusThread, null);
});

test("review changes-requested follow-up re-enters designer context on the same thread", async () => {
  const thread = {
    id: "thread_review_loop",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Hero review loop",
    status: "open",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    handoffIds: ["handoff_design_done", "handoff_review_loop"],
    messages: []
  };
  const designHandoff = {
    id: "handoff_design_done",
    threadId: "thread_review_loop",
    channel: "figma",
    sourceAgent: "planner-agent",
    targetAgent: "designer-agent",
    title: "Hero review loop",
    status: "completed",
    priority: "high",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T09:40:00.000Z",
    claimedAt: "2026-04-22T09:05:00.000Z",
    completedAt: "2026-04-22T09:40:00.000Z",
    claimedBy: "designer-agent",
    payload: {
      summary: "히어로를 더 직접적으로 만든다.",
      designGoal: "짧은 헤드라인과 유지된 CTA로 히어로를 재구성한다.",
      acceptanceCriteria: ["CTA 유지"]
    },
    artifacts: [
      {
        type: "figma",
        path: "/tmp/hero.fig",
        label: "hero"
      }
    ],
    messages: []
  };
  const reviewHandoff = {
    id: "handoff_review_loop",
    threadId: "thread_review_loop",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Hero review loop",
    status: "claimed",
    priority: "high",
    createdAt: "2026-04-22T09:45:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    claimedAt: "2026-04-22T09:46:00.000Z",
    completedAt: null,
    claimedBy: "review-agent",
    payload: {
      type: "design-review",
      title: "Hero review loop",
      summary: "히어로 리뷰",
      designGoal: "짧은 헤드라인과 유지된 CTA로 히어로를 재구성한다.",
      acceptanceCriteria: ["CTA 유지"]
    },
    artifacts: [
      {
        type: "figma",
        path: "/tmp/hero.fig",
        label: "hero"
      }
    ],
    messages: []
  };
  const threads = [thread];
  const handoffs = [designHandoff, reviewHandoff];
  const store = {
    async listThreads(filters = {}) {
      return threads.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.id === filters.threadId));
    },
    async list(filters = {}) {
      return handoffs.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.threadId === filters.threadId));
    },
    async getMailboxReadState(agent) {
      return {
        agent,
        threadId: null,
        lastReadAt: "2026-04-22T09:30:00.000Z",
        globalLastReadAt: "2026-04-22T09:30:00.000Z",
        threadLastReadAt: null,
        updatedAt: "2026-04-22T09:30:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    },
    async complete(id, input) {
      const target = handoffs.find((item) => item.id === id);
      target.status = "completed";
      target.completedAt = "2026-04-22T10:05:00.000Z";
      target.updatedAt = "2026-04-22T10:05:00.000Z";
      target.messages.push({
        author: input.agent,
        body: input.result,
        kind: "result",
        createdAt: "2026-04-22T10:05:00.000Z"
      });
      thread.updatedAt = "2026-04-22T10:05:00.000Z";
      return target;
    },
    async createThreadHandoff(id, input) {
      const handoff = {
        id: "handoff_revision_loop",
        threadId: id,
        channel: input.channel,
        sourceAgent: input.sourceAgent,
        targetAgent: input.targetAgent,
        title: input.title,
        status: "pending",
        priority: input.priority,
        createdAt: "2026-04-22T10:06:00.000Z",
        updatedAt: "2026-04-22T10:06:00.000Z",
        claimedAt: null,
        completedAt: null,
        claimedBy: null,
        payload: input.payload,
        artifacts: [],
        messages: []
      };
      handoffs.push(handoff);
      thread.handoffIds.push(handoff.id);
      thread.updatedAt = "2026-04-22T10:06:00.000Z";
      return { thread, handoff };
    },
    async addArtifact(id, input) {
      const target = handoffs.find((item) => item.id === id);
      target.artifacts.push(input);
      target.updatedAt = "2026-04-22T10:07:00.000Z";
      thread.updatedAt = "2026-04-22T10:07:00.000Z";
      return target;
    }
  };
  const reviewRoute = createReviewRoutes(store, new Map());
  const designerRoute = createDesignerRoutes(store, new Map());

  const decisionResponse = makeResponseCapture();
  const decisionUrl = new URL("http://127.0.0.1:3850/review/threads/thread_review_loop/decision");
  await reviewRoute(
    makeJsonRequest({
      agent: "review-agent",
      decision: "changes-requested",
      note: "헤드라인을 더 짧게 만들고 CTA 대비를 높여 주세요."
    }),
    decisionResponse,
    decisionUrl
  );
  const decisionPayload = JSON.parse(decisionResponse.body);

  assert.equal(decisionPayload.handoff.status, "completed");
  assert.equal(decisionPayload.followup.handoff.channel, "figma");
  assert.equal(decisionPayload.followup.handoff.targetAgent, "designer-agent");

  const designerResponse = makeResponseCapture();
  const designerUrl = new URL("http://127.0.0.1:3850/designer/context?agent=designer-agent");
  await designerRoute({ method: "GET" }, designerResponse, designerUrl);
  const designerPayload = JSON.parse(designerResponse.body);

  assert.equal(designerPayload.context.focusThread.id, "thread_review_loop");
  assert.equal(designerPayload.context.focusThread.latestHandoffId, "handoff_revision_loop");
  assert.equal(designerPayload.context.focusIntent.designGoal, "짧은 헤드라인과 유지된 CTA로 히어로를 재구성한다.");
  assert.equal(designerPayload.context.workQueue[0].handoffId, "handoff_revision_loop");
  assert.equal(designerPayload.context.workQueue[0].status, "pending");
  assert.equal(designerPayload.context.workQueue[0].nextStep, "review-feedback");
  assert.equal(designerPayload.context.handoffs[0].id, "handoff_revision_loop");
  assert.equal(designerPayload.context.handoffs[0].channel, "figma");
});
