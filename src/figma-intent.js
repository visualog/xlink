function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return uniqueStrings(fallback);
}

function normalizeReferenceItem(item) {
  if (!item) {
    return null;
  }

  if (typeof item === "string") {
    const trimmed = item.trim();
    return trimmed ? { type: "link", value: trimmed } : null;
  }

  if (typeof item === "object") {
    const value = String(item.value ?? item.url ?? item.path ?? item.id ?? "").trim();
    if (!value) {
      return null;
    }

    return {
      type: String(item.type ?? "reference").trim() || "reference",
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : null,
      value
    };
  }

  return null;
}

export function normalizeFigmaIntent(payload = {}, artifacts = [], fallback = {}) {
  const references = []
    .concat(Array.isArray(payload.references) ? payload.references : [])
    .concat(Array.isArray(payload.links) ? payload.links : [])
    .map(normalizeReferenceItem)
    .filter(Boolean);
  const files = normalizeStringList(payload.files);
  const links = normalizeStringList(payload.links);
  const acceptanceCriteria = normalizeStringList(
    payload.acceptanceCriteria,
    normalizeStringList(payload.doneDefinition)
  );
  const constraints = normalizeStringList(payload.constraints, payload.details);
  const requestedOutput = normalizeStringList(payload.requestedOutput, [payload.type, ...(payload.tags ?? [])]);
  const referenceArtifacts = (Array.isArray(artifacts) ? artifacts : [])
    .filter((item) => ["figma", "image", "thumbnail"].includes(String(item?.type || "").trim()))
    .map((item) => ({
      type: item.type ?? null,
      path: item.path ?? null,
      label: item.label ?? item.type ?? null
    }));

  return {
    fileKey: String(payload.figmaFileKey ?? payload.fileKey ?? "").trim() || null,
    nodeId: String(payload.nodeId ?? payload.parentId ?? "").trim() || null,
    pageId: String(payload.pageId ?? "").trim() || null,
    screenName: String(payload.screenName ?? payload.title ?? fallback.title ?? "").trim() || null,
    designGoal: String(payload.designGoal ?? payload.summary ?? fallback.summary ?? fallback.title ?? "").trim() || null,
    acceptanceCriteria,
    constraints,
    requestedOutput,
    references,
    referenceArtifacts,
    files,
    links,
    tags: normalizeStringList(payload.tags),
    hasStructuredIntent: Boolean(
      payload.figmaFileKey
      || payload.fileKey
      || payload.nodeId
      || payload.pageId
      || payload.screenName
      || payload.designGoal
      || payload.acceptanceCriteria
      || payload.doneDefinition
      || payload.constraints
      || payload.references
    )
  };
}
