import { StoreError } from "./store.js";
import { toDevlogCard } from "./devlog.js";

function artifactList(handoff) {
  return handoff.artifacts.map((item) => ({
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
    createdAt: handoff.createdAt,
    payload: {
      type: payload.type,
      title: payload.title,
      date: payload.date,
      summary: payload.summary ?? handoff.title,
      details: payload.details ?? [],
      tags: payload.tags ?? [],
      files: payload.files ?? [],
      commit: payload.commit ?? null
    },
    artifacts: artifactList(handoff)
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
  return {
    kind: "figma-brief",
    ...baseProjection(handoff),
    deliverables: artifactList(handoff).filter((item) => ["figma", "thumbnail", "image"].includes(item.type))
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
