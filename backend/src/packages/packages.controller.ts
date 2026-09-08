import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackagesService } from './packages.service';
import { PackagePurchasesService } from './package-purchases.service';
import { PackageAccessService } from './package-access.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { SetPackageArticlesDto } from './dto/set-package-articles.dto';
import { ListPackagesQueryDto } from './dto/list-packages.query.dto';
import { CheckoutPackageDto } from './dto/checkout-package.dto';
import { GrantPackageDto } from './dto/grant-package.dto';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import {
  AnonymousOrReader,
  CurrentReader,
  ReaderAuth,
} from '../reader-auth/reader-auth.decorators';
import type { ReaderPrincipal } from '../reader-auth/reader-auth.guard';

/**
 * Route order matters here: `admin/packages/purchases` and
 * `admin/packages/options` are declared BEFORE `admin/packages/:id`, or
 * Nest matches them as an id and every purchases request becomes a
 * "pacote não encontrado".
 *
 * Every admin route carries @RequirePermissions. RolesGuard is a no-op
 * without it, so a route missing the decorator is reachable by any
 * authenticated member of the newsroom.
 */
@Controller()
export class PackagesController {
  constructor(
    private readonly packages: PackagesService,
    private readonly purchases: PackagePurchasesService,
    private readonly access: PackageAccessService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The public and reader halves are gated; the admin half is not.
   *
   * Editors need to build pacotes before launch day, so the flag only
   * controls whether readers can see or buy them. 404, not 403, matching
   * ReaderFeatureGuard: a switched-off feature should look absent rather
   * than forbidden.
   */
  private assertEnabled() {
    if (this.config.get<string>('FEATURE_PACKAGES') !== 'true') {
      throw new NotFoundException('Pacotes não disponíveis.');
    }
  }

  // ── admin ─────────────────────────────────────────────────────────

  @Get('admin/packages')
  @RequirePermissions('pacotes.ver')
  list(@Query() query: ListPackagesQueryDto) {
    return this.packages.list(query);
  }

  /** Feeds the "Pacote" dropdown in the article editor. */
  @Get('admin/packages/options')
  @RequirePermissions('pacotes.ver')
  options() {
    return this.packages.options();
  }

  @Get('admin/packages/purchases')
  @RequirePermissions('pacotes.ver_compras')
  listPurchases(@Query() query: PageQueryDto) {
    return this.purchases.listPurchases(query);
  }

  @Post('admin/packages/purchases/grant')
  @RequirePermissions('pacotes.oferecer')
  @HttpCode(HttpStatus.OK)
  grant(@Body() dto: GrantPackageDto, @CurrentUser() user: AuthUser) {
    return this.purchases.grant(dto, { id: user.id, role: user.role });
  }

  @Post('admin/packages/purchases/:purchaseId/revoke')
  @RequirePermissions('pacotes.revogar_compra')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('purchaseId') purchaseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchases.revoke(purchaseId, {
      id: user.id,
      role: user.role,
    });
  }

  @Get('admin/packages/:id')
  @RequirePermissions('pacotes.ver')
  findOne(@Param('id') id: string) {
    return this.packages.findOneForAdmin(id);
  }

  @Post('admin/packages')
  @RequirePermissions('pacotes.criar')
  create(@Body() dto: CreatePackageDto, @CurrentUser() user: AuthUser) {
    return this.packages.create(dto, { id: user.id, role: user.role });
  }

  @Patch('admin/packages/:id')
  @RequirePermissions('pacotes.editar')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.packages.update(id, dto, { id: user.id, role: user.role });
  }

  /** PUT, not POST: the whole ordered list, idempotent. */
  @Put('admin/packages/:id/articles')
  @RequirePermissions('pacotes.editar')
  setArticles(
    @Param('id') id: string,
    @Body() dto: SetPackageArticlesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.packages.setArticles(id, dto, {
      id: user.id,
      role: user.role,
    });
  }

  /**
   * Publishes the drafts inside the pacote, makes them exclusive, mints
   * the Stripe Price and puts it on sale.
   *
   * The service ALSO requires artigos.publicar when there are drafts —
   * this must not become a side door around the article publishing right.
   */
  @Post('admin/packages/:id/publish')
  @RequirePermissions('pacotes.publicar')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.packages.publish(id, { id: user.id, role: user.role });
  }

  @Post('admin/packages/:id/unpublish')
  @RequirePermissions('pacotes.publicar')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.packages.unpublish(id, { id: user.id, role: user.role });
  }

  /** For a pacote already on sale that gained a draft article. */
  @Post('admin/packages/:id/publish-pending')
  @RequirePermissions('pacotes.publicar')
  @HttpCode(HttpStatus.OK)
  publishPending(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.packages.publishPendingArticles(id, {
      id: user.id,
      role: user.role,
    });
  }

  /** Turns already-live, still-free members into exclusives. */
  @Post('admin/packages/:id/make-exclusive')
  @RequirePermissions('pacotes.editar')
  @HttpCode(HttpStatus.OK)
  makeExclusive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.packages.makeMembersExclusive(id, {
      id: user.id,
      role: user.role,
    });
  }

  @Delete('admin/packages/:id')
  @RequirePermissions('pacotes.eliminar')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.packages.remove(id, { id: user.id, role: user.role });
  }

  // ── public ────────────────────────────────────────────────────────

  /** Identical for every visitor, so plain @Public() and cacheable. */
  @Public()
  @Get('public/packages')
  listPublic() {
    this.assertEnabled();
    return this.packages.listPublic();
  }

  /**
   * The detail page. Varies per reader — `owned` decides the CTA — so
   * @AnonymousOrReader(), NOT @OptionalReaderAuth(): the latter drags in
   * ReaderFeatureGuard, which would 404 this page the day somebody
   * switched the reader area off.
   */
  @AnonymousOrReader()
  @Get('public/packages/by-slug/:slug')
  async publicBySlug(
    @Param('slug') slug: string,
    @CurrentReader() reader?: ReaderPrincipal,
  ) {
    this.assertEnabled();
    const pkg = await this.packages.findPublicBySlug(slug);
    return {
      ...pkg,
      owned: reader ? await this.access.ownsPackage(reader.id, pkg.id) : false,
    };
  }

  // ── reader ────────────────────────────────────────────────────────

  /**
   * The slug arrives in the BODY so the frontend BFF handler forwards to a
   * constant path with nothing interpolated into it. See
   * CheckoutPackageDto and app/api/conta/_forward.ts.
   */
  @ReaderAuth()
  @Post('reader/packages/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @Body() dto: CheckoutPackageDto,
    @CurrentReader() reader: ReaderPrincipal,
  ) {
    this.assertEnabled();
    return this.purchases.createCheckoutSession(reader, dto.slug);
  }

  /** "Os meus pacotes". Always scoped to the JWT's reader, never a param. */
  @ReaderAuth()
  @Get('reader/packages')
  mine(@CurrentReader() reader: ReaderPrincipal) {
    this.assertEnabled();
    return this.purchases.listForReader(reader.id);
  }
}
