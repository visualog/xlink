import { StoreError } from "./store.js";

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveThumbnail(handoff) {
  const payloadThumbnail = handoff.payload?.thumbnail;
  if (payloadThumbnail) {
    return payloadThumbnail;
  }

  const artifact = handoff.artifacts.find((item) => ["thumbnail", "image", "figma"].includes(item.type));
  return artifact?.path ?? null;
}

function deriveCodeSnippets(handoff) {
  if (Array.isArray(handoff.payload?.codeSnippets)) {
    return handoff.payload.codeSnippets;
  }

  return handoff.artifacts
    .filter((item) => item.type === "codeSnippet" && item.snippet && typeof item.snippet === "object")
    .map((item) => item.snippet);
}

function deriveLinks(handoff) {
  const links = Array.isArray(handoff.payload?.links) ? handoff.payload.links : [];
  return links.length ? links : undefined;
}

function mapStatus(status) {
  if (status === "completed") {
    return "done";
  }

  if (status === "claimed") {
    return "in-progress";
  }

  return status;
}

export function toDevlogCard(handoff) {
  if (handoff.channel !== "devlog") {
    throw new StoreError(409, `handoff ${handoff.id} is not a devlog handoff.`);
  }

  const payload = handoff.payload ?? {};
  const summary = payload.summary ?? handoff.title;
  const codeSnippets = deriveCodeSnippets(handoff);
  const thumbnail = deriveThumbnail(handoff);
  const links = deriveLinks(handoff);

  const card = {
    id: slugify(handoff.id),
    type: payload.type,
    title: payload.title,
    date: payload.date,
    status: mapStatus(handoff.status),
    summary,
    details: payload.details,
    tags: payload.tags,
    files: payload.files ?? [],
    commit: payload.commit ?? null
  };

  if (payload.version) {
    card.version = payload.version;
  }

  if (thumbnail) {
    card.thumbnail = thumbnail;
  }

  if (links) {
    card.links = links;
  }

  if (codeSnippets.length) {
    card.codeSnippets = codeSnippets;
  }

  return card;
}
