const DEFAULT_XBRIDGE_BASE_URL = process.env.XBRIDGE_BASE_URL ?? "http://127.0.0.1:3846";

function normalizeBaseUrl(value) {
  const normalized = String(value || DEFAULT_XBRIDGE_BASE_URL).trim();
  return normalized.replace(/\/+$/, "");
}

function normalizeValidationReport(result = {}) {
  if (result?.validationReport && typeof result.validationReport === "object") {
    return result.validationReport;
  }
  if (result?.report && typeof result.report === "object") {
    return result.report;
  }

  const errorCount = Array.isArray(result?.errors) ? result.errors.length : 0;
  const warningCount = Array.isArray(result?.warnings) ? result.warnings.length : 0;
  const canCompose = result?.canCompose !== false;
  return {
    status: canCompose ? (warningCount > 0 ? "warn" : "pass") : "fail",
    canCompose,
    errorCount,
    warningCount,
    resolvedSource: "unknown",
    resolvedSectionCount: 0
  };
}

function buildValidationSummary(report = {}) {
  const errorCount = Number(report?.errorCount || 0);
  const warningCount = Number(report?.warningCount || 0);
  const readiness = report?.canCompose === false ? "blocked" : "ready";
  return `xbridge compose validation ${readiness}: ${errorCount} error(s), ${warningCount} warning(s)`;
}

function normalizeErrorCodeList(validation = {}) {
  if (!Array.isArray(validation?.errors)) {
    return [];
  }
  return validation.errors
    .map((entry) => String(entry?.code || "").trim())
    .filter(Boolean);
}

export async function validateXbridgeComposePayload(payload = {}, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/api/validate-external-compose-input`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    const error = new Error(
      data?.error || `xbridge validation request failed with status ${response.status}`
    );
    error.status = response.status;
    error.response = data;
    throw error;
  }

  const validation = data.result ?? {};
  const validationReport = normalizeValidationReport(validation);
  const projection = {
    validationReport,
    canCompose: validationReport.canCompose !== false,
    status: validationReport.status,
    errorCount: validationReport.errorCount,
    warningCount: validationReport.warningCount,
    resolvedSource: validationReport.resolvedSource,
    resolvedSectionCount: validationReport.resolvedSectionCount
  };

  return {
    baseUrl,
    validation,
    validationReport,
    projection,
    summary: buildValidationSummary(validationReport)
  };
}

export async function validateXbridgeComposeWithRetry(payload = {}, options = {}) {
  const maxRetriesRaw = Number(options?.retryPolicy?.maxRetries ?? 1);
  const maxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.floor(maxRetriesRaw)) : 1;
  const appliedRules = [];
  const attempts = [];
  let currentPayload = payload && typeof payload === "object" ? { ...payload } : {};

  let result = await validateXbridgeComposePayload(currentPayload, options);
  attempts.push(result);

  let retries = 0;
  while (result?.validationReport?.canCompose === false && retries < maxRetries) {
    const codes = normalizeErrorCodeList(result.validation);
    let mutated = false;

    if (codes.includes("missing_parent_id")) {
      const fallbackParentId = String(options?.retryPolicy?.defaultParentId || "").trim();
      if (fallbackParentId) {
        currentPayload = { ...currentPayload, parentId: fallbackParentId };
        appliedRules.push("inject_default_parent_id");
        mutated = true;
      }
    }

    if (codes.includes("missing_intent_sections")) {
      const fallbackIntentSections = Array.isArray(options?.retryPolicy?.fallbackIntentSections)
        ? options.retryPolicy.fallbackIntentSections
        : [];
      if (fallbackIntentSections.length > 0) {
        currentPayload = {
          ...currentPayload,
          intentSections: fallbackIntentSections
        };
        appliedRules.push("inject_fallback_intent_sections");
        mutated = true;
      }
    }

    if (!mutated) {
      break;
    }

    retries += 1;
    result = await validateXbridgeComposePayload(currentPayload, options);
    attempts.push(result);
  }

  return {
    ...result,
    attempts,
    retries,
    appliedRules,
    retryPolicy: options?.retryPolicy || null,
    payloadUsed: currentPayload
  };
}
