"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "@/lib/api-base";
import { READER_COOKIE, safeNext } from "@/lib/reader-api";

export type FormState = { error?: string; notice?: string };

/**
 * 30 days, matching READER_JWT_EXPIRES_IN. Long sessions are fine here
 * because revocation does not depend on expiry: a password change, a
 * reset or "terminar todas as sessões" bumps Reader.tokenVersion and
 * strands every token already issued.
 */
const READER_MAX_AGE = 60 * 60 * 24 * 30;

async function setReaderCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(READER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" rather than "strict": the post-OAuth top-level redirect in M9
    // must arrive carrying this cookie.
    sameSite: "lax",
    path: "/",
    maxAge: READER_MAX_AGE,
  });
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ res: Response } | { error: string }> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { res };
  } catch {
    return { error: "Não foi possível contactar o servidor. Tente novamente." };
  }
}

export async function readerLoginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "") || undefined);

  if (!email || !password) {
    return { error: "Preencha o e-mail e a palavra-passe." };
  }

  const out = await postJson("/public/reader/login", { email, password });
  if ("error" in out) return out;

  if (!out.res.ok) {
    if (out.res.status === 401) return { error: "Credenciais inválidas." };
    if (out.res.status === 404) {
      return { error: "A área de leitores não está disponível de momento." };
    }
    if (out.res.status === 429) {
      return { error: "Demasiadas tentativas. Aguarde um momento." };
    }
    return { error: "Falha ao iniciar sessão. Tente novamente." };
  }

  const data = (await out.res.json()) as { accessToken?: string };
  if (!data.accessToken) return { error: "Resposta inválida do servidor." };

  await setReaderCookie(data.accessToken);
  redirect(next);
}

export async function readerRegisterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password) {
    return { error: "Preencha o e-mail e a palavra-passe." };
  }
  if (password.length < 10) {
    return { error: "A palavra-passe deve ter pelo menos 10 caracteres." };
  }

  const out = await postJson("/public/reader/register", {
    email,
    password,
    ...(name ? { name } : {}),
  });
  if ("error" in out) return out;

  if (!out.res.ok && out.res.status !== 202) {
    if (out.res.status === 429) {
      return { error: "Demasiados registos a partir deste dispositivo. Tente mais tarde." };
    }
    if (out.res.status === 400) {
      return { error: "Verifique os dados introduzidos." };
    }
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  // The backend answers 202 whether or not the address was already taken,
  // so registration cannot be used to enumerate the readership. The copy
  // here has to stay just as non-committal as the API is.
  return {
    notice:
      "Se o endereço estiver disponível, enviámos uma ligação de confirmação. Verifique o seu e-mail.",
  };
}

export async function readerLogoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(READER_COOKIE);
  redirect("/");
}

export async function readerForgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Introduza o seu e-mail." };

  const out = await postJson("/public/reader/forgot-password", { email });
  if ("error" in out) return out;

  // 204 either way — same non-enumeration rule as registration.
  return {
    notice:
      "Se existir uma conta com esse endereço, enviámos instruções para repor a palavra-passe.",
  };
}

export async function readerResetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!token) return { error: "Ligação inválida. Peça uma nova." };
  if (password.length < 10) {
    return { error: "A palavra-passe deve ter pelo menos 10 caracteres." };
  }

  const out = await postJson("/public/reader/reset-password", {
    token,
    password,
  });
  if ("error" in out) return out;

  if (!out.res.ok && out.res.status !== 204) {
    if (out.res.status === 400) {
      return { error: "Esta ligação é inválida ou já expirou. Peça uma nova." };
    }
    if (out.res.status === 429) {
      return { error: "Demasiadas tentativas. Aguarde um momento." };
    }
    return { error: "Não foi possível alterar a palavra-passe." };
  }

  // Deliberately no auto-login: the reset bumps tokenVersion, so every
  // session is now dead by design. Sending them through the login form
  // also confirms the new password actually works.
  return {
    notice:
      "Pode agora iniciar sessão com a nova palavra-passe. As sessões abertas noutros dispositivos foram terminadas.",
  };
}
