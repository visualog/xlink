function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/g, " ")
    .trim();
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function matchCriterion(criterion, evidenceTexts = []) {
  const normalizedCriterion = normalizeText(criterion);
  if (!normalizedCriterion) {
    return false;
  }

  const criterionTokens = normalizedCriterion.split(/\s+/).filter(Boolean);
  return evidenceTexts.some((text) => {
    const normalizedText = normalizeText(text);
    if (!normalizedText) {
      return false;
    }

    if (normalizedText.includes(normalizedCriterion)) {
      return true;
    }

    const tokenMatches = criterionTokens.filter((token) => normalizedText.includes(token));
    return criterionTokens.length > 0 && tokenMatches.length >= Math.min(2, criterionTokens.length);
  });
}

function determineAssessmentStatus({ blockers, hasDeliverable, acceptanceCriteria, matchedCriteria }) {
  if (blockers.length > 0) {
    return "blocked";
  }

  if (!hasDeliverable) {
    return "needs-design-pass";
  }

  if (acceptanceCriteria.length === 0) {
    return "needs-review";
  }

  if (matchedCriteria === acceptanceCriteria.length) {
    return "ready-for-review";
  }

  return "needs-verification";
}

export function buildExecutionPlan(input = {}) {
  const designIntent = input.designIntent ?? {};
  const hasTarget = Boolean(designIntent.fileKey || designIntent.nodeId);
  const hasAcceptanceCriteria = Array.isArray(designIntent.acceptanceCriteria) && designIntent.acceptanceCriteria.length > 0;
  const hasDeliverable = Array.isArray(input.deliverables) && input.deliverables.length > 0;
  const blockers = Array.isArray(input.blockers) ? input.blockers : [];

  const stage = blockers.length > 0
    ? "blocked"
    : hasDeliverable
      ? "verify-and-handoff"
      : "design-pass";

  const steps = [
    {
      id: hasTarget ? "load-target" : "confirm-target",
      title: hasTarget ? "대상 파일/노드 열기" : "대상 파일/노드 확인",
      status: hasTarget ? "ready" : "attention",
      detail: hasTarget
        ? [designIntent.fileKey, designIntent.nodeId].filter(Boolean).join(" / ")
        : "fileKey 또는 nodeId가 아직 없어 작업 대상을 먼저 확정해야 합니다."
    },
    {
      id: "review-constraints",
      title: "제약과 기준 확인",
      status: hasAcceptanceCriteria || (designIntent.constraints ?? []).length > 0 ? "ready" : "optional",
      detail: uniqueStrings([...(designIntent.constraints ?? []), ...(designIntent.acceptanceCriteria ?? [])]).join(" · ") || "명시된 제약/기준 없음"
    },
    {
      id: "apply-design-pass",
      title: "디자인 수정 반영",
      status: blockers.length > 0 ? "blocked" : "ready",
      detail: designIntent.designGoal ?? "현재 목표를 기준으로 디자인 수정"
    },
    {
      id: "verify-criteria",
      title: "완료 기준 점검",
      status: hasAcceptanceCriteria ? "ready" : "optional",
      detail: hasAcceptanceCriteria
        ? `${designIntent.acceptanceCriteria.length}개 acceptance criteria 확인`
        : "명시된 acceptance criteria 없음"
    },
    {
      id: "attach-deliverable",
      title: hasDeliverable ? "산출물 검토" : "산출물 첨부",
      status: hasDeliverable ? "ready" : "attention",
      detail: hasDeliverable ? "기존 figma/image 산출물이 있습니다." : "결과 산출물을 handoff 또는 projection에 남겨야 합니다."
    }
  ];

  return {
    stage,
    steps
  };
}

export function buildCompletionAssessment(input = {}) {
  const designIntent = input.designIntent ?? {};
  const blockers = Array.isArray(input.blockers) ? input.blockers : [];
  const deliverables = Array.isArray(input.deliverables) ? input.deliverables : [];
  const evidenceTexts = uniqueStrings(
    []
      .concat(input.messageBodies ?? [])
      .concat(input.decisionBodies ?? [])
      .concat(input.referenceTexts ?? [])
  );
  const acceptanceCriteria = Array.isArray(designIntent.acceptanceCriteria) ? designIntent.acceptanceCriteria : [];
  const criteria = acceptanceCriteria.map((criterion) => ({
    text: criterion,
    status: matchCriterion(criterion, evidenceTexts) ? "mentioned" : "pending"
  }));
  const matchedCriteria = criteria.filter((item) => item.status === "mentioned").length;
  const hasDeliverable = deliverables.length > 0;
  const status = determineAssessmentStatus({
    blockers,
    hasDeliverable,
    acceptanceCriteria,
    matchedCriteria
  });

  return {
    status,
    hasDeliverable,
    deliverableCount: deliverables.length,
    matchedCriteria,
    totalCriteria: acceptanceCriteria.length,
    criteria,
    missing: criteria.filter((item) => item.status !== "mentioned").map((item) => item.text)
  };
}
