import { StoreError } from "./store.js";
import { toDevlogCard } from "./devlog.js";
import { normalizeFigmaIntent } from "./figma-intent.js";
import { getHandoffLastActivityAt } from "./mailbox.js";

function artifactList(handoff) {
  return (Array.isArray(handoff.artifacts) ? handoff.artifacts : []).map((item) => ({
    type: item.type,
    path: item.path,
    label: item.label ?? item.type
  }));
}

function baseProjection(handoff) {
  const payload = handoff.payload ?? {};

  return {
    id: handoff.id,
    channel: handoff.channel,
    title: handoff.title,
    status: handoff.status,
    priority: handoff.priority,
    sourceAgent: handoff.sourceAgent,
    targetAgent: handoff.targetAgent,
    threadId: handoff.threadId ?? null,
    createdAt: handoff.createdAt,
    updatedAt: getHandoffLastActivityAt(handoff),
    payload: {
      type: payload.type,
      title: payload.title,
      date: payload.date,
      summary: payload.summary ?? handoff.title,
      details: payload.details ?? [],
      tags: payload.tags ?? [],
      files: payload.files ?? [],
      links: payload.links ?? [],
      commit: payload.commit ?? null
    },
    artifacts: artifactList(handoff)
  };
}

export function normalizeFigmaDeliverables(artifacts = []) {
  const deliverables = artifacts.filter((item) => ["figma", "thumbnail", "image"].includes(item.type));

  return {
    deliverables,
    deliverableCount: deliverables.length,
    deliverableTypes: Array.from(new Set(deliverables.map((item) => item.type).filter(Boolean))),
    primaryDeliverable: deliverables[0] ?? null
  };
}

export function normalizeFigmaBriefEntry(entry = {}) {
  const data = entry?.data ?? entry;
  const payload = data?.payload ?? {};
  const fallbackTitle = data?.title ?? payload.title ?? null;
  const normalizedDeliverables = normalizeFigmaDeliverables(
    Array.isArray(data?.deliverables)
      ? data.deliverables
      : Array.isArray(data?.artifacts)
        ? data.artifacts
        : []
  );

  return {
    id: data?.id ?? entry?.id ?? null,
    threadId: data?.threadId ?? null,
    channel: entry?.channel ?? data?.channel ?? "figma",
    kind: entry?.kind ?? "figma-brief",
    title: fallbackTitle,
    status: data?.status ?? null,
    priority: data?.priority ?? null,
    sourceAgent: data?.sourceAgent ?? null,
    targetAgent: data?.targetAgent ?? null,
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? data?.createdAt ?? null,
    objective: payload.summary ?? payload.title ?? fallbackTitle,
    workType: payload.type ?? null,
    constraints: Array.isArray(payload.constraints) && payload.constraints.length > 0
      ? payload.constraints
      : (payload.details ?? []),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    files: Array.isArray(payload.files) ? payload.files : [],
    links: Array.isArray(payload.links) ? payload.links : [],
    figmaIntent: data?.figmaIntent ?? normalizeFigmaIntent(payload, normalizedDeliverables.deliverables, {
      title: fallbackTitle,
      summary: payload.summary ?? fallbackTitle
    }),
    ...normalizedDeliverables
  };
}

function toReviewBrief(handoff) {
  return {
    kind: "review-brief",
    ...baseProjection(handoff),
    checklist: [
      "변경 파일 검토",
      "핵심 리스크 확인",
      "테스트 필요 여부 판단",
      "승인 또는 피드백 기록"
    ]
  };
}

function toDocsBrief(handoff) {
  return {
    kind: "docs-brief",
    ...baseProjection(handoff),
    suggestedSections: [
      "What changed",
      "Why it matters",
      "Files touched",
      "Follow-up notes"
    ]
  };
}

function toFigmaBrief(handoff) {
  const projection = baseProjection(handoff);
  const normalizedDeliverables = normalizeFigmaDeliverables(projection.artifacts);

  return {
    kind: "figma-brief",
    ...projection,
    objective: projection.payload.summary ?? projection.title,
    workType: projection.payload.type ?? null,
    constraints: Array.isArray(handoff.payload?.constraints) && handoff.payload.constraints.length > 0
      ? handoff.payload.constraints
      : projection.payload.details,
    links: projection.payload.links ?? [],
    figmaIntent: normalizeFigmaIntent(handoff.payload ?? {}, projection.artifacts, {
      title: handoff.title,
      summary: handoff.payload?.summary ?? handoff.title
    }),
    ...normalizedDeliverables
  };
}

export function projectHandoff(handoff, channel = handoff.channel) {
  switch (channel) {
    case "devlog":
      return {
        kind: "devlog-card",
        channel,
        data: toDevlogCard(handoff)
      };
    case "review":
      return {
        kind: "review-brief",
        channel,
        data: toReviewBrief(handoff)
      };
    case "docs":
      return {
        kind: "docs-brief",
        channel,
        data: toDocsBrief(handoff)
      };
    case "figma":
      return {
        kind: "figma-brief",
        channel,
        data: toFigmaBrief(handoff)
      };
    case "bridge":
      return {
        kind: "bridge-summary",
        channel,
        data: baseProjection(handoff)
      };
    default:
      throw new StoreError(400, `Unsupported projection channel: ${channel}`);
  }
}
