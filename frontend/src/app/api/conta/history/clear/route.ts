import { forward } from "../../_forward";

/**
 * Clear the whole reading history.
 *
 * POST rather than DELETE-on-a-link because this is irreversible and must
 * never be reachable by a prefetch or a link scanner. The backend route
 * it forwards to is DELETE /reader/history.
 */
export async function POST() {
  return forward("/reader/history", { method: "DELETE" });
}
