import { Injectable, Logger } from '@nestjs/common';
import { GRAPH_BASE, SocialConfig } from './social.config';
import { GraphError, graphGet, graphPost } from './graph.fetch';
import type { PublishResult } from './facebook.client';

/**
 * Publishing to the newspaper's Instagram account.
 *
 * Two things about this API shape the rest of the feature:
 *
 *  1. **It is two calls, not one.** First a container is created from an
 *     image URL and a caption; then that container is published. Between
 *     them Meta goes and FETCHES the image from us — which is why the
 *     cover has to be served from an address reachable on the public
 *     internet, and why the JPEG endpoint exists at all.
 *
 *  2. **JPEG only.** Everything this site stores is WebP. The image URL
 *     handed over here points at /social-image/..., which transcodes on
 *     the way out; see SocialImageController for why that is preferable
 *     to writing a second variant to disk.
 *
 * And one thing about the platform, which belongs in the client's
 * documentation because it keeps surprising people: an Instagram caption
 * cannot contain a clickable link. The post drives reach, not traffic.
 */
@Injectable()
export class InstagramClient {
  private readonly logger = new Logger(InstagramClient.name);

  constructor(private readonly config: SocialConfig) {}

  get configured(): boolean {
    return Boolean(this.config.accessToken && this.config.instagramId);
  }

  async publish(caption: string, imageUrl: string): Promise<PublishResult> {
    const token = this.config.accessToken;
    const igId = this.config.instagramId;
    if (!token || !igId) {
      throw new GraphError(
        'Falta META_INSTAGRAM_ID ou META_PAGE_ACCESS_TOKEN no ambiente.',
      );
    }

    // Step 1 — the container. If this fails nothing was published and
    // there is nothing to undo, which is why the two steps are never
    // collapsed or reordered.
    const container = await graphPost<{ id: string }>(
      `${GRAPH_BASE}/${igId}/media`,
      { image_url: imageUrl, caption, access_token: token },
    );

    // Step 2 — publish it. A failure HERE may still have left a usable
    // container behind; it is discarded rather than retried in place,
    // because the retry path goes through the outbox row and rebuilds
    // the container from scratch. An orphan container expires on Meta's
    // side after 24h and costs nothing.
    const published = await graphPost<{ id: string }>(
      `${GRAPH_BASE}/${igId}/media_publish`,
      { creation_id: container.id, access_token: token },
    );

    // The permalink is worth the extra call here, unlike Facebook: the
    // media id alone does not compose into a public address, so without
    // it the admin queue could say "enviado" and not say where to.
    let permalink: string | null = null;
    try {
      const info = await graphGet<{ permalink?: string }>(
        `${GRAPH_BASE}/${published.id}`,
        { fields: 'permalink', access_token: token },
      );
      permalink = info.permalink ?? null;
    } catch (err) {
      // Non-fatal by design. The post IS published; failing the outbox
      // row now would schedule a retry that posts it a second time.
      this.logger.warn(
        `Publicado no Instagram (${published.id}) mas sem permalink: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { remoteId: published.id, remoteUrl: permalink };
  }

  /**
   * How much of the 100-posts-per-24h allowance is spent.
   *
   * Shown in the admin next to "Testar ligação" — the quota is the one
   * limit of this integration that can be hit by ordinary use, and the
   * error Meta returns when it is exhausted is not self-explanatory.
   */
  async quota(): Promise<{ used: number; cap: number }> {
    const token = this.config.accessToken;
    const igId = this.config.instagramId;
    if (!token || !igId) throw new GraphError('Instagram não configurado.');

    const body = await graphGet<{
      data?: { quota_usage?: number; config?: { quota_total?: number } }[];
    }>(`${GRAPH_BASE}/${igId}/content_publishing_limit`, {
      fields: 'config,quota_usage',
      access_token: token,
    });

    const row = body.data?.[0];
    return {
      used: row?.quota_usage ?? 0,
      cap: row?.config?.quota_total ?? 100,
    };
  }
}
