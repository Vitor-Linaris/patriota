import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  MAX_LOGIN_ATTEMPTS,
  MIN_LOGIN_ATTEMPTS,
} from '../settings/settings.service';

/** Quanto tempo uma conta fica bloqueada, e a janela em que as falhas contam. */
export const LOCK_WINDOW_SECONDS = 15 * 60;

const DEFAULT_MAX_ATTEMPTS = 5;
/** O valor de Configurações › Segurança muda raramente; não vale uma query por login. */
const SETTING_CACHE_MS = 60_000;

/**
 * Bloqueio do login de staff por CONTA, ao lado do limite por IP.
 *
 * O limite de pedidos (5/min no POST /auth/login) é por visitante, e por
 * isso não trava quem roda de endereço — uma botnet, ou um proxy que deixe
 * passar um X-Forwarded-For escrito pelo cliente. Contar por conta fecha
 * isso: depois de `maxLoginAttempts` falhas seguidas num e-mail, o login
 * desse e-mail fica recusado durante 15 minutos, venha de onde vier.
 *
 * Conta por e-mail pedido, exista ou não a conta. Contar só as que
 * existem faria do bloqueio uma forma de saber que e-mails são da
 * redacção.
 *
 * O custo conhecido: alguém pode bloquear de propósito o login de um
 * colega durante 15 minutos. É o preço habitual deste controlo; a janela
 * curta é o que o mantém aceitável.
 *
 * Se o Redis falhar, deixa passar (e regista). Um Redis em baixo não pode
 * impedir a redacção inteira de entrar; o limite por IP continua activo.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);
  private cachedMax: { value: number; at: number } | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private key(email: string): string {
    return `login-fail:${email.trim().toLowerCase()}`;
  }

  /** True quando este e-mail já esgotou as tentativas da janela. */
  async isLocked(email: string): Promise<boolean> {
    try {
      const raw = await this.redis.getClient().get(this.key(email));
      return Number(raw ?? 0) >= (await this.maxAttempts());
    } catch (e) {
      this.logger.error(
        `Bloqueio de login indisponível: ${(e as Error).message}`,
      );
      return false;
    }
  }

  /** Conta uma falha. A janela começa na primeira e não é prolongada pelas seguintes. */
  async recordFailure(email: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      const key = this.key(email);
      const n = await client.incr(key);
      if (n === 1) await client.expire(key, LOCK_WINDOW_SECONDS);
    } catch (e) {
      this.logger.error(
        `Bloqueio de login indisponível: ${(e as Error).message}`,
      );
    }
  }

  /** Um login certo apaga as falhas anteriores. */
  async reset(email: string): Promise<void> {
    try {
      await this.redis.getClient().del(this.key(email));
    } catch (e) {
      this.logger.error(
        `Bloqueio de login indisponível: ${(e as Error).message}`,
      );
    }
  }

  /** `seguranca.maxLoginAttempts`, dentro dos limites que a gravação também aplica. */
  private async maxAttempts(): Promise<number> {
    if (this.cachedMax && Date.now() - this.cachedMax.at < SETTING_CACHE_MS) {
      return this.cachedMax.value;
    }
    const row = await this.prisma.setting.findUnique({
      where: { section: 'seguranca' },
      select: { data: true },
    });
    const raw = (row?.data as { maxLoginAttempts?: unknown } | null)
      ?.maxLoginAttempts;
    const n = Number(raw);
    const value =
      Number.isInteger(n) && n >= MIN_LOGIN_ATTEMPTS && n <= MAX_LOGIN_ATTEMPTS
        ? n
        : DEFAULT_MAX_ATTEMPTS;
    this.cachedMax = { value, at: Date.now() };
    return value;
  }
}
