import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const VALID_SECTIONS = [
  'geral',
  'email',
  'seo',
  'redes',
  'newsletter',
  'seguranca',
  'redacao',
] as const;

export type SectionName = (typeof VALID_SECTIONS)[number];

const DEFAULTS: Record<SectionName, Record<string, unknown>> = {
  geral: {
    siteName: 'O Patriota Notícias',
    tagline: 'Jornalismo independente que faz a diferença.',
    siteUrl: 'https://www.opatriota.pt',
    timezone: 'Europe/Lisbon',
    language: 'pt-PT',
    breakingNews: true,
    maintenanceMode: false,
  },
  email: {
    smtpHost: 'smtp.sendgrid.net',
    smtpPort: '587',
    smtpUser: 'apikey',
    fromName: 'O Patriota Notícias',
    fromEmail: 'noreply@opatriota.pt',
    // Interruptor geral dos avisos de artigo novo aos leitores. Ligado por
    // omissão: desligado, um site acabado de instalar recolhe quem segue
    // categorias, marca as notificações como pendentes e nunca envia nada
    // — sem erro nenhum, em lado nenhum. A funcionalidade existe para ser
    // usada; quem a quiser parar tem o interruptor à mão.
    //
    // A chave mantém o nome antigo de propósito: é o que está gravado nas
    // linhas de Setting que já existem, e renomeá-la trocaria a definição
    // de um site em produção pelo valor de omissão sem ninguém pedir.
    emailArticlePublished: true,
    // emailComments e emailSubscriptions viviam aqui e foram removidos:
    // nada no backend alguma vez os leu. Eram dois interruptores que
    // gravavam e não faziam absolutamente nada — pior que inúteis, porque
    // prometiam à redacção um controlo que não existia.
  },
  seo: {
    metaTitle: 'O Patriota Notícias — Jornalismo independente',
    metaDescription:
      'Cobertura completa da actualidade portuguesa. Política, economia, investigação e sociedade.',
    ogImage: 'https://www.opatriota.pt/og-default.jpg',
    canonicalUrl: 'https://www.opatriota.pt',
    googleAnalytics: 'G-XXXXXXXXXX',
    indexing: true,
    sitemap: true,
  },
  redes: {
    twitter: '@opatriota',
    facebook: 'https://facebook.com/opatriota',
    instagram: '@opatriota_pt',
    linkedin: 'https://linkedin.com/company/opatriota',
    youtube: 'https://youtube.com/@opatriota',
    shareButtons: true,
    twitterCards: true,
  },
  newsletter: {
    provider: 'brevo',
    listId: '12',
    apiKey: '',
    welcomeEmail: true,
    doubleOptin: true,
    weeklyDigest: true,
    digestDay: 'segunda',
  },
  seguranca: {
    twoFactor: false,
    sessionTimeout: '480',
    maxLoginAttempts: '5',
    ipWhitelist: '',
    auditLog: true,
    recaptcha: true,
    recaptchaKey: '',
  },
  /**
   * Choices the newsroom offers its own staff, rather than site policy.
   *
   * `cadencias` is the list behind the "Com que frequência publica"
   * dropdown on /admin/perfil. It lives here, in a Setting row, because
   * the whole point of the request was that somebody in the newsroom can
   * add to it without a deploy — and because putting it here means the
   * question "who may change it" is already answered by
   * `configuracoes.editar`, which today is held by SUPER_ADMIN and
   * EDITOR_CHEFE and nobody else. If that ever needs to change it is one
   * switch on /admin/permissoes, not a code change with two role names
   * hard-coded into it.
   */
  redacao: {
    cadencias: [
      'Duas vezes por semana',
      'Uma vez por semana',
      'Uma vez por mês',
      'Uma vez a cada 2 meses',
    ],
  },
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<SectionName, Record<string, unknown>>> {
    const rows = await this.prisma.setting.findMany();
    const byKey = new Map(rows.map((r) => [r.section, r.data as Record<string, unknown>]));
    const out: Record<string, Record<string, unknown>> = {};
    for (const section of VALID_SECTIONS) {
      out[section] = { ...DEFAULTS[section], ...(byKey.get(section) ?? {}) };
    }
    return out as Record<SectionName, Record<string, unknown>>;
  }

  async get(section: SectionName) {
    const row = await this.prisma.setting.findUnique({ where: { section } });
    return {
      ...DEFAULTS[section],
      ...((row?.data as Record<string, unknown>) ?? {}),
    };
  }

  /**
   * The cadence choices a journalist may pick from, cleaned up.
   *
   * Trimmed, de-duplicated and stripped of blanks HERE rather than at
   * the point of use, so the profile dropdown and the validation that
   * guards it are reading exactly the same list.
   */
  async cadences(): Promise<string[]> {
    const section = (await this.get('redacao')) as { cadencias?: unknown };
    const raw = Array.isArray(section.cadencias) ? section.cadencias : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const value = item.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  async put(section: SectionName, data: Record<string, unknown>) {
    if (!VALID_SECTIONS.includes(section)) {
      throw new BadRequestException('Secção inválida.');
    }
    if (section === 'redacao') {
      // An empty list would leave every journalist with a required field
      // and nothing to put in it — a screen nobody can save. Refused
      // here, where the person doing it can still see why.
      const list = Array.isArray(data.cadencias) ? data.cadencias : [];
      const clean = [
        ...new Set(
          list
            .filter((i): i is string => typeof i === 'string')
            .map((i) => i.trim())
            .filter(Boolean),
        ),
      ];
      if (clean.length === 0) {
        throw new BadRequestException(
          'Deixe pelo menos uma cadência na lista: é um campo obrigatório no perfil e sem opções ninguém consegue gravar o seu.',
        );
      }
      data = { ...data, cadencias: clean };
    }
    return this.prisma.setting.upsert({
      where: { section },
      update: { data: data as never },
      create: { section, data: data as never },
    });
  }
}
