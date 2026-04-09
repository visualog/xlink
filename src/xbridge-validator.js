const DEFAULT_XBRIDGE_BASE_URL = process.env.XBRIDGE_BASE_URL ?? "http://127.0.0.1:3846";

function normalizeBaseUrl(value) {
  const normalized = String(value || DEFAULT_XBRIDGE_BASE_URL).trim();
  return normalized.replace(/\/+$/, "");
}

function buildValidationSummary(result = {}) {
  const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
  const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
  const readiness = result.canCompose ? "ready" : "blocked";
  return `xbridge compose validation ${readiness}: ${errorCount} error(s), ${warningCount} warning(s)`;
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

  return {
    baseUrl,
    validation: data.result,
    summary: buildValidationSummary(data.result)
  };
}
