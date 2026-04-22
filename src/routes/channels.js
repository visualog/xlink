import { json } from "../http.js";
import { StoreError } from "../store.js";

export function createChannelRoutes(projectionStores = new Map()) {
  return async function handleChannelRoute(request, response, url, pathParts) {
    if (pathParts[0] !== "channels" || pathParts.length < 3) {
      return false;
    }

    const channel = pathParts[1];
    const projectionStore = projectionStores.get(channel);

    if (!projectionStore) {
      throw new StoreError(404, `channel ${channel} was not found.`);
    }

    if (request.method === "GET" && pathParts[2] === "entries" && pathParts.length === 3) {
      const snapshot = await projectionStore.listEntries();
      json(response, 200, snapshot);
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "entries" && pathParts.length === 4) {
      const entry = await projectionStore.getEntryById(pathParts[3]);
      json(response, 200, entry);
      return true;
    }

    return false;
  };
}
