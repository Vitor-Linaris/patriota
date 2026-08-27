import type { ReactNode } from "react";

/**
 * Pass-through layout.
 *
 * The reader session is NOT checked here, even though the plan originally
 * put requireReader() at this level: /conta/entrar, /conta/registar,
 * /conta/recuperar and /conta/verificar are all children of this segment
 * and must stay reachable while logged out. Guarding here would redirect
 * the login page to itself.
 *
 * The dashboard and the other private pages call requireReader()
 * themselves — one API round-trip each, which is the same cost the admin
 * side already pays per page through AdminShell.
 */
export default function ContaLayout({ children }: { children: ReactNode }) {
  return children;
}
