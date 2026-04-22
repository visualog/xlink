import test from "node:test";
import assert from "node:assert/strict";

import { createReviewRoutes } from "../src/routes/review.js";

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
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
          id: "thread_review_001",
          channel: "review",
          sourceAgent: "designer-agent",
          targetAgent: "review-agent",
          title: "Review: Hero redesign",
          status: "open",
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:10:00.000Z",
          handoffIds: ["handoff_review_001"],
          messages: [
            {
              author: "designer-agent",
              body: "리뷰 부탁드립니다.",
              kind: "note",
              createdAt: "2026-04-22T10:10:00.000Z"
            }
          ]
        },
        {
          id: "thread_review_002",
          channel: "review",
          sourceAgent: "designer-agent",
          targetAgent: "review-agent",
          title: "Closed review",
          status: "open",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T09:15:00.000Z",
          handoffIds: ["handoff_review_002"],
          messages: []
        }
      ];
      return threads.filter((thread) => (!filters.channel || thread.channel === filters.channel)
        && (!filters.targetAgent || thread.targetAgent === filters.targetAgent));
    },
    async list(filters = {}) {
      const handoffs = [
        {
          id: "handoff_review_001",
          threadId: "thread_review_001",
          channel: "review",
          sourceAgent: "designer-agent",
          targetAgent: "review-agent",
          title: "Review: Hero redesign",
          status: "pending",
          priority: "high",
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:10:00.000Z",
          claimedAt: null,
          completedAt: null,
          claimedBy: null,
          payload: {
            type: "design-review",
            title: "Review: Hero redesign",
            summary: "히어로 메시지를 더 직접적으로 만든다.",
            details: ["acceptance: CTA 유지", "assessment: ready-for-review"],
            files: ["Landing.fig"],
            links: ["https://example.com/reference"],
            figmaFileKey: "FILE_123",
            nodeId: "817:417",
            screenName: "Landing Hero",
            designGoal: "히어로 메시지를 더 직접적으로 만든다.",
            acceptanceCriteria: ["CTA 유지"]
          },
          artifacts: [
            {
              type: "figma",
              path: "/tmp/landing.fig",
              label: "landing"
            }
          ],
          messages: [
            {
              author: "designer-agent",
              body: "리뷰 부탁드립니다.",
              kind: "note",
              createdAt: "2026-04-22T10:10:00.000Z"
            }
          ]
        },
        {
          id: "handoff_review_002",
          threadId: "thread_review_002",
          channel: "review",
          sourceAgent: "designer-agent",
          targetAgent: "review-agent",
          title: "Closed review",
          status: "completed",
          priority: "medium",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T09:15:00.000Z",
          claimedAt: "2026-04-22T09:05:00.000Z",
          completedAt: "2026-04-22T09:15:00.000Z",
          claimedBy: "review-agent",
          payload: {
            type: "design-review",
            title: "Closed review",
            summary: "done"
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
        agent: "review-agent",
        threadId: null,
        lastReadAt: "2026-04-22T10:05:00.000Z",
        globalLastReadAt: "2026-04-22T10:05:00.000Z",
        threadLastReadAt: null,
        updatedAt: "2026-04-22T10:05:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    }
  };
}

test("GET /review/context returns review aggregate context", async () => {
  const route = createReviewRoutes(
    makeStore(),
    new Map([
      ["review", {
        async listEntries() {
          return {
            channel: "review",
            updatedAt: "2026-04-22",
            entries: [
              {
                id: "handoff_review_001",
                kind: "review-brief",
                data: {
                  id: "handoff_review_001",
                  threadId: "thread_review_001",
                  title: "Review: Hero redesign",
                  status: "pending",
                  priority: "high",
                  sourceAgent: "designer-agent",
                  targetAgent: "review-agent",
                  updatedAt: "2026-04-22T10:10:00.000Z",
                  payload: {
                    summary: "히어로 메시지를 더 직접적으로 만든다.",
                    files: ["Landing.fig"],
                    links: ["https://example.com/reference"]
                  },
                  artifacts: [
                    {
                      type: "figma",
                      path: "/tmp/landing.fig",
                      label: "landing"
                    }
                  ],
                  checklist: [
                    "변경 파일 검토",
                    "핵심 리스크 확인"
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
  const url = new URL("http://127.0.0.1:3850/review/context?agent=review-agent");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.context.channel, "review");
  assert.equal(payload.context.summary.unreadThreads, 1);
  assert.equal(payload.context.focusThread.id, "thread_review_001");
  assert.equal(payload.context.focusHandoff.payload.figmaFileKey, "FILE_123");
  assert.equal(payload.context.focusHandoff.payload.acceptanceCriteria[0], "CTA 유지");
  assert.equal(payload.context.focusBrief.id, "handoff_review_001");
  assert.equal(payload.context.focusChecklist.length, 2);
  assert.equal(payload.context.nextActions[0].type, "review-unread-thread");
  assert.equal(payload.context.workQueue[0].threadId, "thread_review_001");
  assert.equal(payload.context.workQueue[0].checklistCount, 2);
});

test("GET /review/context excludes closed handoffs by default and can include them", async () => {
  const route = createReviewRoutes(makeStore(), new Map());

  const defaultResponse = makeResponseCapture();
  const defaultUrl = new URL("http://127.0.0.1:3850/review/context?agent=review-agent");
  await route({ method: "GET" }, defaultResponse, defaultUrl);
  const defaultPayload = JSON.parse(defaultResponse.body);

  assert.equal(defaultPayload.context.handoffs.length, 1);
  assert.equal(defaultPayload.context.handoffs[0].status, "pending");

  const includeClosedResponse = makeResponseCapture();
  const includeClosedUrl = new URL("http://127.0.0.1:3850/review/context?agent=review-agent&includeClosed=true");
  await route({ method: "GET" }, includeClosedResponse, includeClosedUrl);
  const includeClosedPayload = JSON.parse(includeClosedResponse.body);

  assert.equal(includeClosedPayload.context.handoffs.length, 2);
});

test("POST /review/threads/:id/decision approves review handoff and returns updated context", async () => {
  const thread = {
    id: "thread_review_decision",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review hero",
    status: "open",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    handoffIds: ["handoff_review_decision"],
    messages: []
  };
  const handoff = {
    id: "handoff_review_decision",
    threadId: "thread_review_decision",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review hero",
    status: "pending",
    priority: "high",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    payload: {
      summary: "hero review"
    },
    artifacts: [],
    messages: []
  };
  const threads = [thread];
  const handoffs = [handoff];
  const store = {
    async listThreads(filters = {}) {
      return threads.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent));
    },
    async list(filters = {}) {
      return handoffs.filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.threadId === filters.threadId));
    },
    async getMailboxReadState() {
      return null;
    },
    async listMailboxReadStates() {
      return [];
    },
    async claim(id, input) {
      handoff.status = "claimed";
      handoff.claimedBy = input.agent;
      handoff.claimedAt = "2026-04-22T10:11:00.000Z";
      handoff.updatedAt = "2026-04-22T10:11:00.000Z";
      return handoff;
    },
    async appendMessage(id, input) {
      handoff.messages.push({
        ...input,
        createdAt: "2026-04-22T10:12:00.000Z"
      });
      handoff.updatedAt = "2026-04-22T10:12:00.000Z";
      thread.updatedAt = "2026-04-22T10:12:00.000Z";
      return handoff;
    },
    async complete(id, input) {
      handoff.status = "completed";
      handoff.completedAt = "2026-04-22T10:13:00.000Z";
      handoff.updatedAt = "2026-04-22T10:13:00.000Z";
      handoff.messages.push({
        author: input.agent,
        body: input.result,
        kind: "result",
        createdAt: "2026-04-22T10:13:00.000Z"
      });
      thread.updatedAt = "2026-04-22T10:13:00.000Z";
      return handoff;
    }
  };
  const route = createReviewRoutes(store, new Map());
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/review/threads/thread_review_decision/decision");

  const handled = await route(
    makeJsonRequest({
      agent: "review-agent",
      decision: "approved",
      note: "Looks good"
    }),
    response,
    url
  );
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.status, "completed");
  assert.equal(payload.decision.type, "approved");
  assert.equal(payload.context.handoffs.length, 0);
  assert.equal(payload.context.handoffs.some((item) => item.id === "handoff_review_decision"), false);
  assert.equal(payload.context.handoffs.some((item) => item.status === "completed"), false);
  assert.equal(payload.context.threads.some((item) => item.latestHandoffId === "handoff_review_decision"), false);
  assert.equal(payload.context.workQueue.some((item) => item.handoffId === "handoff_review_decision"), false);
});

test("POST /review/threads/:id/decision can create figma follow-up for changes requested", async () => {
  const thread = {
    id: "thread_review_followup",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review hero",
    status: "open",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    handoffIds: ["handoff_review_followup"],
    messages: []
  };
  const handoff = {
    id: "handoff_review_followup",
    threadId: "thread_review_followup",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review hero",
    status: "claimed",
    priority: "high",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    claimedAt: "2026-04-22T10:05:00.000Z",
    completedAt: null,
    claimedBy: "review-agent",
    payload: {
      type: "design-review",
      title: "Review hero",
      summary: "hero review",
      details: ["acceptance: CTA 유지"],
      acceptanceCriteria: ["CTA 유지"]
    },
    artifacts: [
      {
        type: "figma",
        path: "/tmp/landing.fig",
        label: "landing"
      }
    ],
    messages: []
  };
  const store = {
    async list(filters = {}) {
      return [handoff].filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.threadId || item.threadId === filters.threadId));
    },
    async listThreads() {
      return [thread];
    },
    async getMailboxReadState() {
      return null;
    },
    async listMailboxReadStates() {
      return [];
    },
    async appendMessage(id, input) {
      handoff.messages.push({
        ...input,
        createdAt: "2026-04-22T10:12:00.000Z"
      });
      handoff.updatedAt = "2026-04-22T10:12:00.000Z";
      return handoff;
    },
    async complete(id, input) {
      handoff.status = "completed";
      handoff.completedAt = "2026-04-22T10:13:00.000Z";
      handoff.updatedAt = "2026-04-22T10:13:00.000Z";
      handoff.messages.push({
        author: input.agent,
        body: input.result,
        kind: "result",
        createdAt: "2026-04-22T10:13:00.000Z"
      });
      return handoff;
    },
    async createThreadHandoff(id, input) {
      return {
        thread,
        handoff: {
          id: "handoff_figma_followup",
          threadId: id,
          channel: input.channel,
          sourceAgent: input.sourceAgent,
          targetAgent: input.targetAgent,
          title: input.title,
          priority: input.priority,
          payload: input.payload,
          artifacts: [],
          messages: [],
          status: "pending"
        }
      };
    },
    async addArtifact(id, input) {
      return {
        id,
        artifacts: [input]
      };
    }
  };
  const route = createReviewRoutes(store, new Map());
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/review/threads/thread_review_followup/decision");

  const handled = await route(
    makeJsonRequest({
      agent: "review-agent",
      decision: "changes-requested",
      note: "헤드라인을 더 짧게"
    }),
    response,
    url
  );
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.status, "completed");
  assert.equal(payload.followup.handoff.id, "handoff_figma_followup");
  assert.equal(payload.followup.handoff.threadId, "thread_review_followup");
  assert.equal(payload.followup.handoff.channel, "figma");
  assert.equal(payload.followup.handoff.sourceAgent, "review-agent");
  assert.equal(payload.followup.handoff.targetAgent, "designer-agent");
  assert.equal(payload.followup.handoff.priority, "high");
  assert.equal(payload.followup.handoff.status, "pending");
  assert.equal(payload.followup.handoff.payload.summary.includes("헤드라인을 더 짧게"), true);
  assert.equal(payload.followup.handoff.payload.acceptanceCriteria[0], "CTA 유지");
  assert.equal(payload.followup.handoff.artifacts.length, 1);
  assert.deepEqual(payload.followup.handoff.artifacts[0], {
    type: "figma",
    path: "/tmp/landing.fig",
    label: "landing"
  });
});

test("POST /review/threads/:id/decision keeps blocked review visible", async () => {
  const thread = {
    id: "thread_review_blocked",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review blocked hero",
    status: "open",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    handoffIds: ["handoff_review_blocked"],
    messages: []
  };
  const handoff = {
    id: "handoff_review_blocked",
    threadId: "thread_review_blocked",
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review blocked hero",
    status: "pending",
    priority: "high",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:10:00.000Z",
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    payload: {
      type: "design-review",
      summary: "hero review"
    },
    artifacts: [],
    messages: []
  };
  const store = {
    async listThreads(filters = {}) {
      return [thread].filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent));
    },
    async list(filters = {}) {
      return [handoff].filter((item) => (!filters.channel || item.channel === filters.channel)
        && (!filters.targetAgent || item.targetAgent === filters.targetAgent)
        && (!filters.threadId || item.threadId === filters.threadId));
    },
    async getMailboxReadState() {
      return null;
    },
    async listMailboxReadStates() {
      return [];
    },
    async claim(id, input) {
      handoff.status = "claimed";
      handoff.claimedBy = input.agent;
      handoff.claimedAt = "2026-04-22T10:11:00.000Z";
      handoff.updatedAt = "2026-04-22T10:11:00.000Z";
      return handoff;
    },
    async block(id, input) {
      handoff.status = "blocked";
      handoff.blockedAt = "2026-04-22T10:12:00.000Z";
      handoff.updatedAt = "2026-04-22T10:12:00.000Z";
      handoff.messages.push({
        author: input.agent,
        body: input.reason,
        kind: "blocker",
        createdAt: "2026-04-22T10:12:00.000Z"
      });
      return handoff;
    }
  };
  const route = createReviewRoutes(store, new Map());
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/review/threads/thread_review_blocked/decision");

  const handled = await route(
    makeJsonRequest({
      agent: "review-agent",
      decision: "blocked",
      reason: "reference frame missing"
    }),
    response,
    url
  );
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.status, "blocked");
  assert.equal(payload.decision.type, "blocked");
  assert.equal(payload.context.handoffs.some((item) => item.id === "handoff_review_blocked"), true);
  assert.equal(payload.context.handoffs.find((item) => item.id === "handoff_review_blocked").status, "blocked");
  assert.equal(payload.context.summary.blockedHandoffs, 1);
  assert.equal(payload.context.nextActions[0].type, "resolve-blocked-review");
  assert.equal(payload.context.workQueue.some((item) => item.handoffId === "handoff_review_blocked"), true);
});
