/**
 * Quantos proxies de confiança estão à frente deste serviço.
 *
 * Cada proxy acrescenta ao fim do X-Forwarded-For o endereço de quem se
 * ligou a ele, por isso as últimas N entradas são as únicas que o cliente
 * não escreveu. Com N errado para menos, o endereço de um proxy passa a
 * ser "o visitante" e toda a gente partilha os mesmos limites; para mais,
 * uma entrada escrita pelo cliente passa a contar e os limites deixam de
 * travar quem a muda a cada pedido.
 *
 * - 1 (omissão): Caddy ou Nginx sozinho à frente.
 * - 2: Cloudflare (proxy activo, "nuvem laranja") + Caddy/Nginx.
 *
 * O frontend lê a mesma variável (frontend/src/lib/forwarded-ip.ts). Cada
 * serviço põe o valor da SUA cadeia — o site e a API podem não ter os
 * mesmos proxies à frente.
 *
 * Um valor inválido pára o arranque: adivinhar aqui seria escolher em
 * silêncio entre os dois erros acima.
 */
export function trustedProxyHops(
  raw: string | undefined = process.env.TRUSTED_PROXY_HOPS,
): number {
  const value = raw?.trim();
  if (!value) return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new Error(
      `TRUSTED_PROXY_HOPS inválido ("${value}"): tem de ser um inteiro entre 0 e 5. ` +
        'Use 1 com Caddy ou Nginx sozinho, 2 com Cloudflare à frente.',
    );
  }
  return n;
}
