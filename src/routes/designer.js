import { json } from "../http.js";
import { buildDesignerContext } from "../designer-context.js";

export function createDesignerRoutes(store, projectionStores = new Map()) {
  return async function handleDesignerRoute(request, response, url) {
    if (request.method === "GET" && url.pathname === "/designer/context") {
      const channel = url.searchParams.get("channel") ?? "figma";
      const context = await buildDesignerContext(store, projectionStores.get(channel), {
        agent: url.searchParams.get("agent") ?? undefined,
        channel,
        limit: url.searchParams.get("limit") ?? undefined,
        handoffLimit: url.searchParams.get("handoffLimit") ?? undefined,
        briefLimit: url.searchParams.get("briefLimit") ?? undefined,
        includeClosed: url.searchParams.get("includeClosed") === "true"
      });
      json(response, 200, { context });
      return true;
    }

    return false;
  };
}
