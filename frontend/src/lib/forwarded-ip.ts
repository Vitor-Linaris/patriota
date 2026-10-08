/**
 * Quantos proxies de confiança estão à frente do site — a mesma regra e o
 * mesmo nome que a API (backend/src/common/trusted-proxy.ts).
 *
 * - 1 (omissão): Caddy ou Nginx sozinho.
 * - 2: Cloudflare (proxy activo) + Caddy/Nginx.
 *
 * Ao contrário da API, um valor inválido não pára o site: volta a 1, que
 * é o certo para a instalação descrita no README.
 */
export function trustedProxyHops(
  raw: string | undefined = process.env.TRUSTED_PROXY_HOPS,
): number {
  const n = Number(raw?.trim() || 1);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

/**
 * O endereço do visitante, a partir dos cabeçalhos que o proxy escreveu.
 *
 * Cada proxy acrescenta ao FIM do X-Forwarded-For o endereço de quem se
 * ligou a ele. A primeira entrada, que era a que se usava, é a única que
 * o cliente pode escrever à vontade: com um Nginx configurado da forma
 * habitual ($proxy_add_x_forwarded_for), mudá-la a cada pedido dava um
 * "visitante" novo por pedido e nenhum limite travava nada. A entrada
 * certa é a N-ésima a contar do fim, com N = proxies de confiança.
 *
 * Com Caddy (que substitui o cabeçalho) e com Nginx (que acrescenta) o
 * resultado é o mesmo, e é o mesmo que a API calcula com `trust proxy`.
 *
 * Cadeia mais curta do que N: devolve a primeira entrada, como o Express.
 * X-Real-IP só conta quando não há X-Forwarded-For nenhum.
 */
export function clientIpFrom(
  forwardedFor: string | null | undefined,
  realIp: string | null | undefined,
  hops: number = trustedProxyHops(),
): string | null {
  const chain = (forwardedFor ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length > 0 && hops > 0) {
    return chain[Math.max(0, chain.length - hops)];
  }
  return realIp?.trim() || null;
}
