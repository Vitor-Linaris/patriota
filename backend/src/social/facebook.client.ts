import { Injectable, Logger } from '@nestjs/common';
import { GRAPH_BASE } from './social.config';
import { SocialConfig } from './social.config';
import { GraphError, graphGet, graphPost } from './graph.fetch';

/** What a network client gives back when a post actually went out. */
export interface PublishResult {
  remoteId: string;
  remoteUrl: string | null;
}

/**
 * Publishing to the newspaper's Facebook Page.
 *
 * A LINK post, not a photo post, and that is the whole design decision:
 * Facebook scrapes the article page's Open Graph tags and builds the
 * clickable card itself — headline, description, cover — so one field
 * (`link`) replaces uploading an image, and the reader gets something
 * they can actually click through to. A photo post gets more reach per
 * impression and sends nobody to the site, which is the opposite of what
 * this feature is for.
 *
 * It also means Facebook never sees our WebP problem: Meta fetches
 * whatever `og:image` points at and converts it itself.
 *
 * The consequence is that this client is only as good as the article
 * page's metadata — see generateMetadata in frontend artigo/[slug].
 */
@Injectable()
export class FacebookClient {
  private readonly logger = new Logger(FacebookClient.name);

  constructor(private readonly config: SocialConfig) {}

  get configured(): boolean {
    return Boolean(this.config.accessToken && this.config.pageId);
  }

  async publish(message: string, link: string): Promise<PublishResult> {
    const token = this.config.accessToken;
    const pageId = this.config.pageId;
    if (!token || !pageId) {
      throw new GraphError(
        'Falta META_PAGE_ID ou META_PAGE_ACCESS_TOKEN no ambiente.',
      );
    }

    const body = await graphPost<{ id: string }>(
      `${GRAPH_BASE}/${pageId}/feed`,
      { message, link, access_token: token },
    );

    // Comes back as "<pageId>_<postId>". The permalink is built from it
    // rather than fetched: one less round trip on the happy path, and a
    // link that would only be used by a human clicking through from the
    // admin queue is not worth a second call to Meta.
    return {
      remoteId: body.id,
      remoteUrl: `https://www.facebook.com/${body.id.replace('_', '/posts/')}`,
    };
  }

  /** "Testar ligação" in the admin — proves the token reaches the Page. */
  async describe(): Promise<{ id: string; name: string }> {
    const token = this.config.accessToken;
    const pageId = this.config.pageId;
    if (!token || !pageId) {
      throw new GraphError('Facebook não configurado.');
    }
    return graphGet<{ id: string; name: string }>(`${GRAPH_BASE}/${pageId}`, {
      fields: 'id,name',
      access_token: token,
    });
  }
}
