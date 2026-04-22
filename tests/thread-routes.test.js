import test from "node:test";
import assert from "node:assert/strict";

import { createThreadRoutes } from "../src/routes/threads.js";

function makeThread() {
  return {
    id: "thread_2026_04_22_001",
    channel: "bridge",
    sourceAgent: "bridge-agent",
    targetAgent: "review-agent",
    title: "Review toolbar layout",
    status: "open",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:05:00.000Z",
    handoffIds: ["handoff_2026_04_22_001"],
    messages: [
      {
        author: "bridge-agent",
        body: "Please review the toolbar layout.",
        kind: "question",
        createdAt: "2026-04-22T10:01:00.000Z"
      }
    ]
  };
}

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

function parseResponseJson(response) {
  return JSON.parse(response.body);
}

test("GET /threads returns thread list", async () => {
  const store = {
    async listThreads() {
      return [makeThread()];
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/threads?channel=bridge");

  const handled = await route({ method: "GET" }, response, url, ["threads"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.threads.length, 1);
  assert.equal(payload.threads[0].id, "thread_2026_04_22_001");
});

test("GET /threads can include thread summaries with unread state", async () => {
  const store = {
    async listThreads() {
      return [makeThread()];
    },
    async list() {
      return [
        {
          id: "handoff_2026_04_22_001",
          threadId: "thread_2026_04_22_001",
          channel: "bridge",
          targetAgent: "review-agent",
          sourceAgent: "bridge-agent",
          title: "Review toolbar layout",
          status: "claimed",
          priority: "medium",
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:04:00.000Z",
          claimedAt: "2026-04-22T10:02:00.000Z",
          completedAt: null,
          claimedBy: "review-agent",
          payload: {},
          artifacts: [],
          messages: []
        }
      ];
    },
    async getMailboxReadState() {
      return {
        agent: "review-agent",
        lastReadAt: "2026-04-22T10:02:30.000Z",
        globalLastReadAt: "2026-04-22T10:02:30.000Z",
        updatedAt: "2026-04-22T10:02:30.000Z"
      };
    },
    async listMailboxReadStates() {
      return [];
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/threads?agent=review-agent&includeReadState=true");

  const handled = await route({ method: "GET" }, response, url, ["threads"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.threads.length, 1);
  assert.equal(payload.summaries.length, 1);
  assert.equal(payload.summaries[0].id, "thread_2026_04_22_001");
  assert.equal(payload.summaries[0].unread, true);
  assert.equal(payload.summaries[0].lastReadAt, "2026-04-22T10:02:30.000Z");
  assert.equal(payload.threads[0].unread, true);
  assert.equal(payload.threads[0].latestHandoffStatus, "claimed");
  assert.equal(payload.mailbox.agent, "review-agent");
  assert.equal(payload.mailbox.unreadCount, 1);
});

test("POST /threads creates a thread", async () => {
  const store = {
    async createThread(input) {
      return {
        ...makeThread(),
        title: input.title
      };
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          channel: "bridge",
          sourceAgent: "bridge-agent",
          targetAgent: "review-agent",
          title: "Create a review thread"
        }),
        "utf8"
      );
    }
  };
  const url = new URL("http://127.0.0.1:3850/threads");

  const handled = await route(request, response, url, ["threads"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 201);
  assert.equal(payload.thread.title, "Create a review thread");
});

test("GET /threads/:id/messages returns thread messages", async () => {
  const store = {
    async getThreadById() {
      return makeThread();
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/threads/thread_2026_04_22_001/messages");

  const handled = await route({ method: "GET" }, response, url, ["threads", "thread_2026_04_22_001", "messages"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].kind, "question");
});

test("GET /threads/:id can include summary and read state", async () => {
  const store = {
    async getThreadById() {
      return makeThread();
    },
    async listThreads() {
      return [makeThread()];
    },
    async list() {
      return [
        {
          id: "handoff_2026_04_22_001",
          threadId: "thread_2026_04_22_001",
          channel: "bridge",
          targetAgent: "review-agent",
          sourceAgent: "bridge-agent",
          title: "Review toolbar layout",
          status: "claimed",
          priority: "medium",
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:04:00.000Z",
          claimedAt: "2026-04-22T10:02:00.000Z",
          completedAt: null,
          claimedBy: "review-agent",
          payload: {},
          artifacts: [],
          messages: []
        }
      ];
    },
    async getMailboxReadState() {
      return {
        agent: "review-agent",
        threadId: "thread_2026_04_22_001",
        lastReadAt: "2026-04-22T10:06:00.000Z",
        globalLastReadAt: "2026-04-22T10:02:30.000Z",
        threadLastReadAt: "2026-04-22T10:06:00.000Z",
        updatedAt: "2026-04-22T10:06:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [
        {
          agent: "review-agent",
          threadId: "thread_2026_04_22_001",
          lastReadAt: "2026-04-22T10:06:00.000Z",
          updatedAt: "2026-04-22T10:06:00.000Z"
        }
      ];
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/threads/thread_2026_04_22_001?agent=review-agent&includeReadState=true");

  const handled = await route({ method: "GET" }, response, url, ["threads", "thread_2026_04_22_001"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.thread.id, "thread_2026_04_22_001");
  assert.equal(payload.thread.unread, false);
  assert.equal(payload.thread.latestHandoffStatus, "claimed");
  assert.equal(payload.thread.threadLastReadAt, "2026-04-22T10:06:00.000Z");
  assert.equal(payload.summary.id, "thread_2026_04_22_001");
  assert.equal(payload.summary.unread, false);
  assert.equal(payload.summary.lastReadAt, "2026-04-22T10:06:00.000Z");
  assert.equal(payload.readState.threadLastReadAt, "2026-04-22T10:06:00.000Z");
});

test("GET /threads/:id/context returns deep thread context packet", async () => {
  const store = {
    async getThreadById() {
      return {
        ...makeThread(),
        channel: "figma",
        targetAgent: "designer-agent",
        title: "Hero redesign"
      };
    },
    async list() {
      return [
        {
          id: "handoff_2026_04_22_001",
          threadId: "thread_2026_04_22_001",
          channel: "figma",
          targetAgent: "designer-agent",
          sourceAgent: "planner-agent",
          title: "Hero redesign",
          status: "claimed",
          priority: "high",
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:05:00.000Z",
          claimedAt: "2026-04-22T10:02:00.000Z",
          completedAt: null,
          claimedBy: "designer-agent",
          payload: {
            type: "screen-update",
            title: "Hero redesign",
            date: "2026-04-22",
            summary: "히어로 섹션의 메시지를 더 강하게 정리한다.",
            details: ["기존 CTA 유지", "카피는 더 짧게"],
            tags: ["hero", "landing"],
            files: ["Landing.fig"],
            links: ["https://example.com/reference"],
            figmaFileKey: "FILE_123",
            nodeId: "817:417",
            screenName: "Landing Hero",
            designGoal: "핵심 메시지를 더 직접적으로 전달한다.",
            acceptanceCriteria: ["CTA 유지", "카피 축약"]
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
              author: "planner-agent",
              body: "히어로 메시지를 더 강하게 바꿔주세요?",
              kind: "question",
              createdAt: "2026-04-22T10:03:00.000Z"
            },
            {
              author: "designer-agent",
              body: "기존 CTA는 유지하는 방향으로 진행하겠습니다.",
              kind: "reply",
              createdAt: "2026-04-22T10:04:00.000Z"
            }
          ]
        }
      ];
    },
    async getMailboxReadState() {
      return {
        agent: "designer-agent",
        threadId: "thread_2026_04_22_001",
        lastReadAt: "2026-04-22T10:01:00.000Z",
        globalLastReadAt: "2026-04-22T10:01:00.000Z",
        threadLastReadAt: "2026-04-22T10:01:00.000Z",
        updatedAt: "2026-04-22T10:01:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [
        {
          agent: "designer-agent",
          threadId: "thread_2026_04_22_001",
          lastReadAt: "2026-04-22T10:01:00.000Z",
          updatedAt: "2026-04-22T10:01:00.000Z"
        }
      ];
    }
  };
  const projectionStores = new Map([
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
                threadId: "thread_2026_04_22_001",
                title: "Hero redesign",
                payload: {
                  summary: "히어로 섹션의 메시지를 더 강하게 정리한다."
                }
              }
            }
          ]
        };
      }
    }]
  ]);
  const route = createThreadRoutes(store, projectionStores);
  const response = makeResponseCapture();
  const url = new URL(
    "http://127.0.0.1:3850/threads/thread_2026_04_22_001/context?agent=designer-agent&messageLimit=4&handoffLimit=3"
  );

  const handled = await route({ method: "GET" }, response, url, ["threads", "thread_2026_04_22_001", "context"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.context.thread.id, "thread_2026_04_22_001");
  assert.equal(payload.context.summary.activeHandoffId, "handoff_2026_04_22_001");
  assert.equal(payload.context.summary.executionStage, "verify-and-handoff");
  assert.equal(payload.context.summary.assessmentStatus, "needs-verification");
  assert.equal(payload.context.task.objective, "핵심 메시지를 더 직접적으로 전달한다.");
  assert.equal(payload.context.task.constraints[0], "기존 CTA 유지");
  assert.equal(payload.context.task.designIntent.fileKey, "FILE_123");
  assert.equal(payload.context.task.designIntent.nodeId, "817:417");
  assert.equal(payload.context.task.acceptanceCriteria[0], "CTA 유지");
  assert.equal(payload.context.task.executionPlan.stage, "verify-and-handoff");
  assert.equal(payload.context.task.executionPlan.steps.length, 5);
  assert.equal(payload.context.task.openQuestions.length, 1);
  assert.equal(payload.context.context.recentHandoffs.length, 1);
  assert.equal(payload.context.assets.artifacts.length, 1);
  assert.equal(payload.context.assets.channelEntries.figma.length, 1);
  assert.equal(payload.context.assets.figmaDeliverables.length, 1);
  assert.equal(payload.context.figma.screenName, "Landing Hero");
  assert.equal(payload.context.assessment.status, "needs-verification");
  assert.equal(payload.context.assessment.totalCriteria, 2);
});

test("POST /threads/:id/handoffs creates linked handoff", async () => {
  const store = {
    async createThreadHandoff(id) {
      return {
        thread: makeThread(),
        handoff: {
          id: "handoff_2026_04_22_001",
          threadId: id,
          channel: "bridge"
        }
      };
    }
  };
  const route = createThreadRoutes(store);
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          payload: {
            type: "feature",
            title: "Review toolbar layout",
            date: "22 April, 2026",
            details: ["Review toolbar layout"],
            tags: ["thread"]
          }
        }),
        "utf8"
      );
    }
  };
  const url = new URL("http://127.0.0.1:3850/threads/thread_2026_04_22_001/handoffs");

  const handled = await route(request, response, url, ["threads", "thread_2026_04_22_001", "handoffs"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 201);
  assert.equal(payload.handoff.threadId, "thread_2026_04_22_001");
});

test("POST /threads/:id/deliverables attaches artifacts to active handoff and returns context", async () => {
  const handoff = {
    id: "handoff_2026_04_22_001",
    threadId: "thread_2026_04_22_001",
    channel: "figma",
    targetAgent: "designer-agent",
    sourceAgent: "planner-agent",
    title: "Hero redesign",
    status: "pending",
    priority: "high",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:05:00.000Z",
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    payload: {
      type: "screen-update",
      title: "Hero redesign",
      date: "2026-04-22",
      summary: "히어로를 더 직접적으로 만든다.",
      details: ["CTA 유지"],
      tags: ["hero"],
      files: ["Landing.fig"]
    },
    artifacts: [],
    messages: []
  };
  const store = {
    async list(filters = {}) {
      return filters.threadId ? [handoff] : [handoff];
    },
    async claim() {
      handoff.status = "claimed";
      handoff.claimedBy = "designer-agent";
      handoff.claimedAt = "2026-04-22T10:06:00.000Z";
      return handoff;
    },
    async addArtifact(id, input) {
      handoff.artifacts.push({
        ...input,
        createdAt: "2026-04-22T10:07:00.000Z"
      });
      handoff.updatedAt = "2026-04-22T10:07:00.000Z";
      return handoff;
    },
    async appendMessage(id, input) {
      handoff.messages.push({
        ...input,
        createdAt: "2026-04-22T10:07:30.000Z"
      });
      handoff.updatedAt = "2026-04-22T10:07:30.000Z";
      return handoff;
    },
    async getThreadById() {
      return {
        id: "thread_2026_04_22_001",
        channel: "figma",
        sourceAgent: "planner-agent",
        targetAgent: "designer-agent",
        title: "Hero redesign",
        status: "open",
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:07:30.000Z",
        handoffIds: ["handoff_2026_04_22_001"],
        messages: []
      };
    },
    async getMailboxReadState() {
      return null;
    },
    async listMailboxReadStates() {
      return [];
    }
  };
  const route = createThreadRoutes(store, new Map());
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          agent: "designer-agent",
          type: "figma",
          path: "/tmp/landing.fig",
          label: "landing",
          note: "updated hero draft"
        }),
        "utf8"
      );
    }
  };
  const url = new URL("http://127.0.0.1:3850/threads/thread_2026_04_22_001/deliverables");

  const handled = await route(request, response, url, ["threads", "thread_2026_04_22_001", "deliverables"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.artifacts.length, 1);
  assert.equal(payload.addedArtifacts, 1);
  assert.equal(payload.context.assets.figmaDeliverables.length, 1);
});

test("POST /threads/:id/verification records verification result and returns context", async () => {
  const handoff = {
    id: "handoff_2026_04_22_001",
    threadId: "thread_2026_04_22_001",
    channel: "figma",
    targetAgent: "designer-agent",
    sourceAgent: "planner-agent",
    title: "Hero redesign",
    status: "claimed",
    priority: "high",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:05:00.000Z",
    claimedAt: "2026-04-22T10:02:00.000Z",
    completedAt: null,
    claimedBy: "designer-agent",
    payload: {
      type: "screen-update",
      title: "Hero redesign",
      date: "2026-04-22",
      summary: "히어로를 더 직접적으로 만든다.",
      details: ["CTA 유지"],
      tags: ["hero"],
      files: ["Landing.fig"],
      acceptanceCriteria: ["CTA 유지"]
    },
    artifacts: [
      {
        type: "figma",
        path: "/tmp/landing.fig",
        label: "landing",
        createdAt: "2026-04-22T10:06:00.000Z"
      }
    ],
    messages: []
  };
  const store = {
    async list(filters = {}) {
      return filters.threadId ? [handoff] : [handoff];
    },
    async appendMessage(id, input) {
      handoff.messages.push({
        ...input,
        createdAt: "2026-04-22T10:08:00.000Z"
      });
      handoff.updatedAt = "2026-04-22T10:08:00.000Z";
      return handoff;
    },
    async complete(id, input) {
      handoff.status = "completed";
      handoff.completedAt = "2026-04-22T10:09:00.000Z";
      handoff.updatedAt = "2026-04-22T10:09:00.000Z";
      handoff.messages.push({
        author: input.agent,
        body: input.result,
        kind: "result",
        createdAt: "2026-04-22T10:09:00.000Z"
      });
      return handoff;
    },
    async getThreadById() {
      return {
        id: "thread_2026_04_22_001",
        channel: "figma",
        sourceAgent: "planner-agent",
        targetAgent: "designer-agent",
        title: "Hero redesign",
        status: "open",
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:09:00.000Z",
        handoffIds: ["handoff_2026_04_22_001"],
        messages: []
      };
    },
    async getMailboxReadState() {
      return null;
    },
    async listMailboxReadStates() {
      return [];
    }
  };
  const route = createThreadRoutes(store, new Map());
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          agent: "designer-agent",
          status: "ready-for-handoff",
          completeIfReady: true,
          criteria: [{ text: "CTA 유지", status: "pass" }],
          note: "CTA 유지 확인"
        }),
        "utf8"
      );
    }
  };
  const url = new URL("http://127.0.0.1:3850/threads/thread_2026_04_22_001/verification");

  const handled = await route(request, response, url, ["threads", "thread_2026_04_22_001", "verification"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.status, "completed");
  assert.equal(payload.verification.status, "ready-for-handoff");
  assert.equal(payload.context.assessment.hasDeliverable, true);
});
