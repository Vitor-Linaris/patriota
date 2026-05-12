"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
};

const SESSION_COOKIE = "patriota_session";

/**
 * Server action: submits credentials to the backend login route and stores
 * the returned JWT in an httpOnly cookie so the browser never sees it.
 *
 * Backend contract (NestJS — see backend/src/auth/auth.controller.ts):
 *   POST {INTERNAL_API_URL}/auth/login
 *   body: { email, password }
 *   200: { accessToken: string, user: { id, email, name, role } }
 *   401: { message: "Credenciais inválidas." }
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

  let token: string | undefined;
  try {
    const data = (await res.json()) as { accessToken?: string };
    token = data.accessToken;
  } catch {
    return { error: "Resposta inválida do servidor." };
  }

  if (!token) {
    return { error: "Resposta inválida do servidor." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h — matches backend JWT_EXPIRES_IN default
  });

  redirect("/admin/permissions");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
