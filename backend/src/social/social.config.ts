import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

/**
 * The Graph API version this code was written against.
 *
 * Pinned, for the same reason StripeService pins its API version: Meta
 * ships breaking changes between versions and deprecates old ones on a
 * schedule. An implicit "latest" means the next Meta release silently
 * reshapes what the clients below parse, on a day nobody deployed
 * anything.
 */
export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Editorial knobs, read from the `publicacao_social` Setting section. */
export interface SocialPolicy {
  facebookEnabled: boolean;
  instagramEnabled: boolean;
  /** Minutes between publishing an article and the post going out. */
  delayMinutes: number;
  /** Placeholders: {titulo} {resumo} {link} {categoria}. */
  facebookTemplate: string;
  instagramTemplate: string;
}

/**
 * Where the credentials live, and what the newsroom is allowed to change.
 *
 * The split is deliberate and is the rule the rest of this repository
 * already follows: SECRETS IN THE ENVIRONMENT, NEVER IN `Setting`. GET
 * /admin/settings hands that whole JSON blob to anybody holding
 * `configuracoes.aceder`, so a Page access token kept there would be a
 * token shared with the entire newsroom — and a Meta Page token does not
 * expire, so it would stay shared.
 *
 * What DOES live in Setting is everything that is an editorial decision
 * and no use to an attacker: which networks are on, how long the
 * cancellation window is, and the wording of the caption.
 *
 * Like StripeService, the presence of the token IS the feature flag.
 * A separate switch that can disagree with the configuration is how a
 * deployment ends up believing it is publishing when it is not.
 */
@Injectable()
export class SocialConfig {
  private readonly logger = new Logger(SocialConfig.name);
  private warned = false;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  get pageId(): string | undefined {
    return this.config.get<string>('META_PAGE_ID');
  }

  get instagramId(): string | undefined {
    return this.config.get<string>('META_INSTAGRAM_ID');
  }

  get accessToken(): string | undefined {
    return this.config.get<string>('META_PAGE_ACCESS_TOKEN');
  }

  /** The canonical site address — what goes into a shared link. */
  get siteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:3005'
    );
  }

  /**
   * The origin Meta will fetch the cover image from.
   *
   * Derived from UPLOADS_PUBLIC_BASE_URL rather than given its own
   * variable: that one is already the address images are served from and
   * is already correct in every environment, and a second variable
   * saying almost the same thing is a second variable to get wrong.
   *
   * It must be reachable from the internet. The Instagram container step
   * hands Meta a URL and Meta fetches it — an internal Docker hostname
   * produces a container that never becomes ready, with an error that
   * does not say why.
   */
  get apiOrigin(): string | null {
    const base =
      this.config.get<string>('UPLOADS_PUBLIC_BASE_URL') ??
      'http://localhost:8585/uploads';
    try {
      return new URL(base).origin;
    } catch {
      return null;
    }
  }

  /** True when this deployment can actually post to a network. */
  get enabled(): boolean {
    return Boolean(this.accessToken);
  }

  /**
   * Logged once, not per tick. A cron that complains every minute for
   * six months trains everyone to ignore the log it is written in.
   */
  warnIfUnconfigured(): void {
    if (this.enabled || this.warned) return;
    this.warned = true;
    this.logger.warn(
      'META_PAGE_ACCESS_TOKEN não está definido — a publicação automática nas redes sociais está desligada.',
    );
  }

  async policy(): Promise<SocialPolicy> {
    const raw = await this.settings.get('publicacao_social');
    return {
      facebookEnabled: raw.facebookEnabled !== false,
      instagramEnabled: raw.instagramEnabled !== false,
      delayMinutes: clampDelay(raw.delayMinutes),
      facebookTemplate: asText(raw.facebookTemplate) || '{titulo}\n\n{resumo}',
      instagramTemplate:
        asText(raw.instagramTemplate) ||
        '{titulo}\n\n{resumo}\n\nLeia o artigo completo no link da bio.',
    };
  }
}

/**
 * The cancellation window, bounded.
 *
 * Zero is allowed and means "sair no próximo tick" — someone may
 * legitimately want no delay. The ceiling is a day: the value comes from
 * a text field in the admin, and a typo of 600 instead of 60 would leave
 * the newsroom convinced the integration is broken while ten hours of
 * posts sit in the queue.
 */
function clampDelay(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 10;
  return Math.min(Math.round(n), 24 * 60);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
