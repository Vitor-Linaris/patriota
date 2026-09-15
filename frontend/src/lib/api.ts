import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api-base";
import { clientIpHeaders } from "./client-ip";

const SESSION_COOKIE = "patriota_session";


/**
 * Authenticated server-side fetch against the backend.
 * Reads the JWT from the httpOnly session cookie; redirects to /admin/login
 * when the cookie is missing or the backend returns 401.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login");

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      // See client-ip.ts: without this the API counts every visitor as
      // one, and one person's failed logins lock out the newsroom.
      ...(await clientIpHeaders()),
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) redirect("/admin/login");
  return res;
}
