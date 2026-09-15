import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitsService } from '../visits/visits.service';
import { RbacService } from '../rbac/rbac.service';
import type { Role } from '../../generated/prisma/enums';

export interface DashboardActor {
  id: string;
  role: Role;
}

/**
 * The numbers on the admin home page.
 *
 * Every figure here also exists behind a sibling route that gates it:
 * the article counts behind `artigos.ler_todos` on
 * /admin/articles/stats, the staff head count behind `utilizadores.ver`
 * on /admin/users/stats. This controller had no decorator at all, so it
 * handed the same figures — including how many unpublished pieces the
 * newsroom is sitting on, and how many staff accounts exist — to every
 * authenticated account regardless of role. A route with no metadata is
 * not "open by mistake" in a way anybody notices: RolesGuard passes
 * silently when it finds nothing to check.
 *
 * The fix is not one permission over the whole response. Each aggregate
 * answers to the permission that already gates the same information next
 * door, and anything this caller may not see is simply absent. The
 * dashboard already renders a missing figure as a dash, because the
 * reader stats card has worked this way from the start.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
    private readonly rbac: RbacService,
  ) {}

  async getStats(actor: DashboardActor) {
    const perms =
      actor.role === 'SUPER_ADMIN'
        ? null
        : await this.rbac.getPermissionsForRole(actor.role);
    const may = (key: string) => perms === null || perms.includes(key);

    // The same rule articles.service.ts:canSeeAllArticles applies, and
    // for the same reason it gives there: a journalist with only
    // editar_proprios has no business counting a colleague's drafts.
    const seesEveryArticle =
      may('artigos.editar_todos') || may('artigos.ler_todos');
    const scope = seesEveryArticle ? {} : { authorId: actor.id };

    const [published, total, draftAndScheduled, users, visits] =
      await Promise.all([
        this.prisma.article.count({ where: { ...scope, status: 'PUBLICADO' } }),
        this.prisma.article.count({ where: scope }),
        this.prisma.article.count({
          where: { ...scope, status: { in: ['RASCUNHO', 'AGENDADO'] } },
        }),
        may('utilizadores.ver') ? this.prisma.user.count() : null,
        may('analytics.basicas') ? this.visits.getCounts() : null,
      ]);

    return {
      articles: { published, total, pending: draftAndScheduled },
      // null, not 0: the card has to be able to tell "none" from "not
      // for you", or it quietly reports a newsroom of zero people.
      users: users === null ? null : { total: users },
      visits,
    };
  }
}
