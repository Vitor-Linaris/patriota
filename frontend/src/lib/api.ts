import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "patriota_session";

function getApiUrl() {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585"
  );
}

/**
 * Authenticated server-side fetch against the backend.
 * Reads the JWT from the httpOnly session cookie; redirects to /admin/login
 * when the cookie is missing or the backend returns 401.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login");

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) redirect("/admin/login");
  return res;
}
