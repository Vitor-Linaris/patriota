"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
};

/**
 * Server action: submits credentials to the backend login route and stores
 * the returned token in an httpOnly cookie so the browser never sees it.
 *
 * Backend contract assumed (adjust the endpoint / field names below if your
 * backend uses different ones):
 *   POST {INTERNAL_API_URL}/auth/login
 *   body: { email, password }
 *   200: { accessToken: string, ... }
 *   401: { message: string }
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Preencha e-mail e palavra-passe." };
  }

  const apiUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Não foi possível contactar o servidor. Tente novamente." };
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { error: "Credenciais inválidas." };
    }
    return { error: "Falha na autenticação. Tente novamente." };
  }

  // Token extraction is best-effort — adjust to your backend's payload shape.
  let token: string | undefined;
  try {
    const data = (await res.json()) as Record<string, unknown>;
    token =
      (data.accessToken as string | undefined) ??
      (data.token as string | undefined) ??
      (data.access_token as string | undefined);
  } catch {
    /* backend may set the cookie directly instead of returning a body */
  }

  if (token) {
    const cookieStore = await cookies();
    cookieStore.set("patriota_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8h
    });
  }

  redirect("/admin");
}
