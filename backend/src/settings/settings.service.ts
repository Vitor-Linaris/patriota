import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const VALID_SECTIONS = [
  'geral',
  'email',
  'seo',
  'redes',
  'newsletter',
  'seguranca',
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

  async put(section: SectionName, data: Record<string, unknown>) {
    if (!VALID_SECTIONS.includes(section)) {
      throw new BadRequestException('Secção inválida.');
    }
    return this.prisma.setting.upsert({
      where: { section },
      update: { data: data as never },
      create: { section, data: data as never },
    });
  }
}
