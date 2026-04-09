import { StoreError } from "./store.js";

export function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function notFound(response) {
  json(response, 404, { error: "Not Found" });
}

export async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(raw);
  } catch {
    throw new StoreError(400, "Request body must be valid JSON.");
  }
}

export function getPathParts(url) {
  return url.pathname.split("/").filter(Boolean);
}

export async function withErrorHandling(response, task) {
  try {
    return await task();
  } catch (error) {
    if (error instanceof StoreError) {
      return json(response, error.statusCode, { error: error.message, details: error.details ?? null });
    }

    console.error(error);
    return json(response, 500, { error: "Internal Server Error" });
  }
}
