/** Shapes the admin pacote screens read. Mirrors the API's selects. */

export type PackageStatus = "RASCUNHO" | "PUBLICADO" | "ARQUIVADO";

export type ArticleStatus =
  | "RASCUNHO"
  | "EM_REVISAO"
  | "AGENDADO"
  | "PUBLICADO"
  | "ARQUIVADO";

export interface AdminPackage {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  priceCents: number;
  currency: string;
  status: PackageStatus;
  includedInSubscription: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null } | null;
  _count: { items: number; purchases: number };
}

/** A member article, as the editor needs to see it. */
export interface PackageMember {
  position: number;
  article: {
    id: string;
    slug: string;
    title: string;
    status: ArticleStatus;
    exclusive: boolean;
    coverImageUrl: string | null;
    publishedAt: string | null;
    category: { name: string };
  };
}

export interface AdminPackageDetail extends AdminPackage {
  items: PackageMember[];
}

/** A row in the article picker. */
export interface PickableArticle {
  id: string;
  slug: string;
  title: string;
  status: ArticleStatus;
  exclusive: boolean;
  coverImageUrl: string | null;
  publishedAt: string | null;
  category?: { name: string } | null;
}

export interface PackagePurchaseRow {
  id: string;
  status: "PENDENTE" | "PAGO" | "EXPIRADO" | "REEMBOLSADO";
  source: "STRIPE" | "MANUAL";
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  revokedAt: string | null;
  /** A money reversal at Stripe, persisted so the table can show it. */
  refundedAt: string | null;
  refundedAmountCents: number | null;
  /** A chargeback opened by the buyer with their card issuer. */
  disputedAt: string | null;
  grantNote: string | null;
  /**
   * `email` and `name` are absent for a staff role that holds
   * pacotes.ver_compras without leitores.ver — reader identity has one
   * control in this system and it is not this route's permission.
   */
  reader: { id: string; email?: string; name?: string | null };
  package: { id: string; name: string; slug: string };
  grantedBy: { id: string; name: string | null } | null;
  _count: { items: number };
}

/** Which buttons this admin may press. Derived server-side. */
export interface PackagePermissions {
  create: boolean;
  edit: boolean;
  publish: boolean;
  remove: boolean;
  seePurchases: boolean;
  revoke: boolean;
  /** artigos.publicar — needed for a cascade publish, checked by the API. */
  publishArticles: boolean;
}

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  RASCUNHO: "Rascunho",
  EM_REVISAO: "Em revisão",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
  ARQUIVADO: "Arquivado",
};

/**
 * Statuses a pacote refuses. The API refuses these by name too — this
 * copy only keeps them out of the picker, which is convenience.
 */
export const REFUSED_MEMBER_STATUSES: ArticleStatus[] = [
  "AGENDADO",
  "ARQUIVADO",
];
