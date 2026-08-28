/**
 * Static page content map. Pages live at `/p/<slug>`. The Markdown-
 * lite shape (paragraphs + headings) is intentional: it renders in a
 * single template, can be edited as plain text, and avoids loading a
 * full Markdown parser for content this small.
 *
 * Every page should set:
 *   • title — H1, also used as <title>
 *   • intro — 1-2 lead paragraphs under the title
 *   • updatedAt — informative only ("Última actualização")
 *   • sections — array of { heading, body } where body is an array
 *                of paragraphs (or { type: "ul"; items: [...] })
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export interface StaticPage {
  slug: string;
  title: string;
  updatedAt: string;
  intro: string;
  /** Optional one-line crumb shown above the title ("Legal", "Sobre", etc.) */
  crumb?: string;
  sections: { heading: string; blocks: Block[] }[];
}

const p = (text: string): Block => ({ type: "p", text });
const ul = (items: string[]): Block => ({ type: "ul", items });

const SITE_NAME = "O Patriota Notícias";
const SITE_URL = "www.opatriota.pt";

export const STATIC_PAGES: Record<string, StaticPage> = {
  // ── LEGAL ───────────────────────────────────────────────────────
  termos: {
    slug: "termos",
    title: "Termos de Uso",
    crumb: "Legal",
    updatedAt: "Maio 2026",
    intro: `Estes Termos de Uso regulam o acesso e a utilização do website ${SITE_URL} (doravante "${SITE_NAME}" ou "Site") e dos serviços disponibilizados. Ao aceder ao Site, o utilizador declara aceitar integralmente as condições aqui descritas.`,
    sections: [
      {
        heading: "1. Identificação",
        blocks: [
          p(
            `O ${SITE_NAME} é um meio de comunicação social em formato digital, propriedade da entidade editora identificada na página "Estatuto Editorial", registado junto da Entidade Reguladora para a Comunicação Social (ERC).`,
          ),
        ],
      },
      {
        heading: "2. Objecto",
        blocks: [
          p(
            "O Site disponibiliza notícias, reportagens, análises e opinião sobre temas de actualidade nacional e internacional. O conteúdo é produzido pela redacção do jornal e por colaboradores externos devidamente identificados.",
          ),
        ],
      },
      {
        heading: "3. Utilização autorizada",
        blocks: [
          p(
            "O utilizador compromete-se a usar o Site de boa-fé e em conformidade com a lei portuguesa. É expressamente proibido:",
          ),
          ul([
            "Reproduzir, distribuir, modificar ou comercializar conteúdo sem autorização escrita prévia.",
            "Utilizar mecanismos automáticos (scrapers, bots) para extracção massiva de conteúdo.",
            "Interferir com a operação técnica do Site (tentativas de intrusão, sobrecarga, etc.).",
            "Publicar comentários ofensivos, difamatórios, discriminatórios ou contrários à dignidade humana.",
          ]),
        ],
      },
      {
        heading: "4. Propriedade intelectual",
        blocks: [
          p(
            `Todo o conteúdo editorial — textos, fotografias, ilustrações, vídeos, áudios e elementos gráficos — é propriedade do ${SITE_NAME} ou dos seus autores, estando protegido pela legislação portuguesa e internacional sobre direitos de autor.`,
          ),
          p(
            "Citações pontuais com identificação da fonte e respeito pelo direito de citação são permitidas. Qualquer outra utilização requer autorização escrita da redacção.",
          ),
        ],
      },
      {
        heading: "5. Responsabilidade",
        blocks: [
          p(
            "O Site empenha-se em garantir a exactidão da informação publicada, mas não pode ser responsabilizado por erros materiais, interrupções de serviço, perdas de dados ou danos resultantes do uso ou da impossibilidade de uso dos seus conteúdos.",
          ),
          p(
            "Hiperligações para sites externos são fornecidas apenas como referência; o jornal não controla nem se responsabiliza pelo conteúdo desses sites.",
          ),
        ],
      },
      {
        heading: "6. Comentários e contribuições",
        blocks: [
          p(
            "Comentários publicados são da exclusiva responsabilidade dos seus autores. A redacção reserva-se o direito de moderar, editar ou eliminar comentários que violem estes Termos ou a lei aplicável.",
          ),
        ],
      },
      {
        heading: "7. Alterações",
        blocks: [
          p(
            "O jornal reserva-se o direito de modificar estes Termos a qualquer momento. A versão actualizada está sempre disponível nesta página, com indicação da data da última revisão.",
          ),
        ],
      },
      {
        heading: "8. Lei aplicável e foro",
        blocks: [
          p(
            "Estes Termos regem-se pela lei portuguesa. Em caso de litígio, é competente o foro da comarca da sede da entidade editora, com expressa renúncia a qualquer outro.",
          ),
        ],
      },
    ],
  },

  privacidade: {
    slug: "privacidade",
    title: "Política de Privacidade",
    crumb: "Legal",
    updatedAt: "Maio 2026",
    intro: `Esta Política de Privacidade descreve como o ${SITE_NAME} recolhe, utiliza e protege os dados pessoais dos visitantes e subscritores, em conformidade com o Regulamento Geral sobre a Protecção de Dados (RGPD) e a legislação portuguesa aplicável.`,
    sections: [
      {
        heading: "1. Responsável pelo tratamento",
        blocks: [
          p(
            `O responsável pelo tratamento dos dados pessoais é a entidade editora do ${SITE_NAME}, com sede em Portugal. Para questões relacionadas com a privacidade, contacte: privacidade@opatriota.pt.`,
          ),
        ],
      },
      {
        heading: "2. Dados recolhidos",
        blocks: [
          p("Recolhemos dados em duas situações:"),
          ul([
            "Subscrição da newsletter — nome (opcional) e endereço de e-mail.",
            "Dados de navegação — através de cookies técnicos e de medição (ver Política de Cookies).",
          ]),
          p(
            "Não recolhemos dados sensíveis (saúde, opinião política individual, orientação sexual, etc.) sem o seu consentimento expresso.",
          ),
        ],
      },
      {
        heading: "3. Finalidade",
        blocks: [
          p("Os dados são utilizados exclusivamente para:"),
          ul([
            "Envio da newsletter editorial e comunicações afins.",
            "Compreender padrões de leitura agregados (analytics).",
            "Cumprir obrigações legais e responder a pedidos de autoridades competentes.",
          ]),
          p(
            "Os seus dados nunca são vendidos a terceiros nem cedidos para fins de marketing externo.",
          ),
        ],
      },
      {
        heading: "4. Base legal",
        blocks: [
          p(
            "O tratamento dos seus dados baseia-se no seu consentimento expresso (subscrição da newsletter), no nosso interesse legítimo (analytics agregadas, segurança) ou no cumprimento de obrigação legal.",
          ),
        ],
      },
      {
        heading: "5. Prazo de conservação",
        blocks: [
          p(
            "Os dados de subscrição são conservados enquanto a subscrição estiver activa, podendo ser cancelada a qualquer momento. Após o cancelamento, os dados são eliminados no prazo máximo de 30 dias, salvo obrigação legal de conservação.",
          ),
        ],
      },
      {
        heading: "6. Os seus direitos",
        blocks: [
          p("Ao abrigo do RGPD, tem direito a:"),
          ul([
            "Acesso — saber que dados temos sobre si.",
            "Rectificação — corrigir dados imprecisos.",
            "Apagamento — solicitar a eliminação dos seus dados.",
            "Portabilidade — receber os seus dados em formato estruturado.",
            "Oposição — opor-se ao tratamento para fins específicos.",
            "Retirar o consentimento a qualquer momento.",
          ]),
          p(
            "Para exercer qualquer destes direitos, envie um pedido para privacidade@opatriota.pt. Tem ainda o direito de apresentar reclamação junto da Comissão Nacional de Protecção de Dados (CNPD).",
          ),
        ],
      },
      {
        heading: "7. Segurança",
        blocks: [
          p(
            "Adoptamos medidas técnicas e organizativas razoáveis para proteger os seus dados — incluindo encriptação em trânsito (HTTPS), controlo de acessos e armazenamento em infra-estrutura na União Europeia.",
          ),
        ],
      },
    ],
  },

  cookies: {
    slug: "cookies",
    title: "Política de Cookies",
    crumb: "Legal",
    updatedAt: "Maio 2026",
    intro: `Esta Política explica o que são cookies, quais utilizamos no ${SITE_NAME} e como pode geri-los.`,
    sections: [
      {
        heading: "O que é um cookie?",
        blocks: [
          p(
            "Um cookie é um pequeno ficheiro de texto que o navegador guarda no seu dispositivo quando visita um site. Permite reconhecer o utilizador em visitas posteriores e melhorar a experiência de navegação.",
          ),
        ],
      },
      {
        heading: "Cookies que utilizamos",
        blocks: [
          p("O Site utiliza apenas os cookies estritamente necessários:"),
          ul([
            "Sessão — para manter o utilizador autenticado (apenas área de administração).",
            "Preferências — para guardar a aceitação da política de cookies.",
            "Medição agregada — estatísticas anónimas de leitura, sem identificar o utilizador.",
          ]),
          p(
            "Não utilizamos cookies publicitários nem partilhamos dados com redes de tracking externas.",
          ),
        ],
      },
      {
        heading: "Gestão de cookies",
        blocks: [
          p(
            "Pode bloquear ou eliminar cookies através das definições do seu navegador. Tenha em conta que algumas funcionalidades do Site (como o login administrativo) podem deixar de funcionar correctamente sem cookies.",
          ),
        ],
      },
    ],
  },

  erc: {
    slug: "erc",
    title: "Registo ERC",
    crumb: "Legal",
    updatedAt: "Maio 2026",
    intro: `O ${SITE_NAME} é um órgão de comunicação social registado junto da Entidade Reguladora para a Comunicação Social (ERC).`,
    sections: [
      {
        heading: "Informação de registo",
        blocks: [
          ul([
            `Denominação: ${SITE_NAME}`,
            "Tipo: Publicação periódica online",
            "Periodicidade: Diária",
            "Âmbito territorial: Portugal",
            "Número de registo ERC: [a preencher]",
            "Estatuto editorial: ver página dedicada",
          ]),
          p(
            "A informação acima é meramente indicativa. A ficha técnica completa está disponível mediante pedido em redaccao@opatriota.pt.",
          ),
        ],
      },
      {
        heading: "Contactos para reclamações",
        blocks: [
          p(
            "Reclamações relativas a conteúdos podem ser dirigidas à redacção em correcoes@opatriota.pt. Em caso de discordância, o leitor pode recorrer à ERC (www.erc.pt).",
          ),
        ],
      },
    ],
  },

  // ── EDITORIAL ───────────────────────────────────────────────────
  "estatuto-editorial": {
    slug: "estatuto-editorial",
    title: "Estatuto Editorial",
    crumb: "Editorial",
    updatedAt: "Maio 2026",
    intro: `O presente Estatuto Editorial estabelece os princípios e compromissos que orientam o trabalho jornalístico do ${SITE_NAME}, em cumprimento do disposto no artigo 17.º da Lei n.º 2/99 (Lei de Imprensa).`,
    sections: [
      {
        heading: "Identidade",
        blocks: [
          p(
            `O ${SITE_NAME} é um jornal generalista online, independente, comprometido com o rigor informativo e o serviço público. Cobre temas de actualidade nacional e internacional, com particular atenção à política, economia, sociedade, mundo, cultura e investigação.`,
          ),
        ],
      },
      {
        heading: "Princípios orientadores",
        blocks: [
          ul([
            "Rigor e verificação dos factos antes da publicação.",
            "Pluralismo de fontes e perspectivas, com distinção clara entre informação e opinião.",
            "Independência editorial face a interesses políticos, económicos ou comerciais.",
            "Protecção das fontes confidenciais e respeito pelo segredo profissional.",
            "Direito de resposta garantido nos termos da lei.",
            "Correcção pronta e transparente de erros materiais.",
          ]),
        ],
      },
      {
        heading: "Linha editorial",
        blocks: [
          p(
            "Privilegiamos o jornalismo de investigação, a análise contextualizada e a verificação rigorosa. Recusamos sensacionalismo, clickbait e desinformação. Os títulos reflectem com fidelidade o conteúdo das peças.",
          ),
        ],
      },
      {
        heading: "Relação com fontes",
        blocks: [
          p(
            "Todas as fontes são identificadas sempre que tal não comprometa a sua segurança ou integridade. Quando a fonte requer anonimato, a redacção verifica de forma independente a informação obtida antes de publicar.",
          ),
        ],
      },
      {
        heading: "Conflitos de interesse",
        blocks: [
          p(
            "Os jornalistas declaram à direcção qualquer conflito de interesse — financeiro, pessoal, político — que possa afectar a sua imparcialidade. Quando relevante, a informação é divulgada na própria peça.",
          ),
        ],
      },
    ],
  },

  equipa: {
    slug: "equipa",
    title: "A nossa equipa",
    crumb: "Editorial",
    updatedAt: "Maio 2026",
    intro: `O ${SITE_NAME} é feito por uma redacção pequena e dedicada, com colaboradores externos de várias áreas. A lista completa será publicada à medida que a equipa se consolide.`,
    sections: [
      {
        heading: "Direcção",
        blocks: [
          p(
            "Director: a definir. Editor-Chefe: a definir. Editor de fim-de-semana: a definir.",
          ),
        ],
      },
      {
        heading: "Editores de secção",
        blocks: [
          p(
            "A redacção é organizada por secções — Política, Economia, Sociedade, Mundo, Cultura, Desporto, Tecnologia, Saúde, Investigação — com um editor responsável por cada uma.",
          ),
        ],
      },
      {
        heading: "Contribuir",
        blocks: [
          p(
            "Procuramos colaboradores ocasionais para opinião, análise e investigação. Envie a sua proposta para colaboracoes@opatriota.pt com um CV breve e dois exemplos de trabalhos.",
          ),
        ],
      },
    ],
  },

  "politica-correcoes": {
    slug: "politica-correcoes",
    title: "Política de Correcções",
    crumb: "Editorial",
    updatedAt: "Maio 2026",
    intro: `Erros acontecem. Quando acontecem no ${SITE_NAME}, corrigimo-los rapidamente e com transparência. Esta página descreve como.`,
    sections: [
      {
        heading: "Tipos de correcção",
        blocks: [
          ul([
            "Erros materiais (nomes, datas, números, citações) — correcção imediata, nota no rodapé do artigo.",
            "Erros substantivos (interpretação, omissão relevante) — correcção destacada no topo do artigo e nota explicativa.",
            "Direito de resposta — publicado em condições equivalentes às do conteúdo original.",
          ]),
        ],
      },
      {
        heading: "Como reportar",
        blocks: [
          p(
            "Se identificou um erro, envie um e-mail para correcoes@opatriota.pt com o link do artigo e a indicação do que considera incorrecto. Procuraremos responder em 48 horas úteis.",
          ),
        ],
      },
      {
        heading: "Registo público",
        blocks: [
          p(
            "Correcções relevantes são listadas no rodapé do artigo afectado, com data e descrição da alteração — não removemos nem sobrescrevemos sem deixar rasto.",
          ),
        ],
      },
    ],
  },

  transparencia: {
    slug: "transparencia",
    title: "Transparência",
    crumb: "Editorial",
    updatedAt: "Maio 2026",
    intro: `Acreditamos que um jornalismo credível começa por explicar como é feito e como se sustenta. Esta página reúne a informação essencial sobre o funcionamento do ${SITE_NAME}.`,
    sections: [
      {
        heading: "Fontes de financiamento",
        blocks: [
          p("O Site sustenta-se através de:"),
          ul([
            "Receita publicitária programática e directa (com clara distinção visual entre conteúdo editorial e publicidade).",
            "Subscrições voluntárias da audiência (em preparação).",
            "Eventuais parcerias editoriais — sempre divulgadas no início do conteúdo respectivo.",
          ]),
          p(
            "Não recebemos financiamento de partidos políticos, governos ou entidades estatais.",
          ),
        ],
      },
      {
        heading: "Conteúdo patrocinado",
        blocks: [
          p(
            'Quando um conteúdo é patrocinado, é identificado de forma inequívoca com a etiqueta "Conteúdo patrocinado" no topo, separação visual e cor de fundo distinta. O patrocinador não participa na produção editorial.',
          ),
        ],
      },
      {
        heading: "Inteligência artificial",
        blocks: [
          p(
            "Utilizamos ferramentas de IA para apoiar tarefas editoriais — sugestão de títulos, revisão linguística, geração de tags. Toda a IA é supervisionada por jornalistas e nenhum artigo é publicado sem revisão humana. Quando IA gera elementos visíveis ao leitor (resumos automáticos, ilustrações), é explicitamente assinalado.",
          ),
        ],
      },
      {
        heading: "Acessibilidade",
        blocks: [
          p(
            "Trabalhamos para que o Site seja acessível a leitores com deficiência. Reporte qualquer barreira encontrada em acessibilidade@opatriota.pt.",
          ),
        ],
      },
    ],
  },

  // ── CONTACTO ────────────────────────────────────────────────────
  redaccao: {
    slug: "redaccao",
    title: "Contactar a Redacção",
    crumb: "Contacto",
    updatedAt: "Maio 2026",
    intro:
      "A redacção do jornal recebe sugestões de pauta, denúncias, correcções e direitos de resposta. Garantimos a confidencialidade das fontes.",
    sections: [
      {
        heading: "Canais",
        blocks: [
          ul([
            "Sugestões e denúncias: redaccao@opatriota.pt",
            "Correcções: correcoes@opatriota.pt",
            "Direito de resposta: direito.resposta@opatriota.pt",
          ]),
        ],
      },
      {
        heading: "Comunicação confidencial",
        blocks: [
          p(
            "Para informações sensíveis, recomendamos o envio através de canais cifrados. Disponibilizamos canal Signal a pedido.",
          ),
        ],
      },
    ],
  },

  publicidade: {
    slug: "publicidade",
    title: "Publicidade",
    crumb: "Contacto",
    updatedAt: "Maio 2026",
    intro:
      "Trabalhamos com anunciantes que respeitam os critérios editoriais e a experiência do leitor. Oferecemos formatos display e parcerias de conteúdo identificado.",
    sections: [
      {
        heading: "Formatos disponíveis",
        blocks: [
          ul([
            "Billboard topo (970×250) — homepage e secções principais.",
            "Leaderboard meio de conteúdo (728×90).",
            "Medium Rectangle (300×250) — coluna lateral.",
            "Large Rectangle (336×280) — dentro de artigos.",
          ]),
        ],
      },
      {
        heading: "Contacto comercial",
        blocks: [
          p("Para tabela de preços, datas de disponibilidade e propostas de campanha, contacte: publicidade@opatriota.pt"),
        ],
      },
    ],
  },

  assinatura: {
    slug: "assinatura",
    title: "Conta e assinatura",
    crumb: "Leitores",
    updatedAt: "Agosto 2026",
    intro: `A conta de leitor do ${SITE_NAME} já está disponível e é gratuita. A assinatura paga, com conteúdo exclusivo, está em preparação.`,
    sections: [
      {
        heading: "Conta gratuita — disponível agora",
        blocks: [
          p(
            "Criar conta não custa nada e leva menos de um minuto. Com sessão iniciada passa a poder:",
          ),
          ul([
            "Guardar notícias para ler mais tarde, com o coração no topo de cada artigo.",
            "Seguir as categorias que lhe interessam e receber um e-mail quando sair notícia nova nesses temas.",
            "Comentar e acompanhar, na sua área, em que notícias participou.",
            "Consultar o histórico do que andou a ler.",
          ]),
          p(
            "Pode escolher entre receber as novidades assim que saem, num resumo diário ou num resumo semanal — e desligar tudo a qualquer momento, categoria a categoria ou de uma só vez.",
          ),
        ],
      },
      {
        heading: "Assinatura paga — em preparação",
        blocks: [
          p(
            "Estamos a preparar uma subscrição paga que acrescentará conteúdo exclusivo, newsletter exclusiva e acesso ao arquivo histórico. Não há ainda data de lançamento nem preço fechado.",
          ),
          p(
            "Quem já tiver conta gratuita não precisa de fazer nada: a assinatura será um acréscimo à conta existente, sem registo novo e sem perder o que tiver guardado.",
          ),
        ],
      },
      {
        heading: "Privacidade",
        blocks: [
          p(
            "A conta de leitor é totalmente separada da área de administração do jornal e não dá qualquer acesso a ela. Pode apagar a sua conta quando quiser, nas definições — os seus dados pessoais são removidos e os comentários que deixou permanecem sem o seu nome, para não abrir buracos nas conversas de outras pessoas.",
          ),
        ],
      },
    ],
  },

  imprensa: {
    slug: "imprensa",
    title: "Imprensa & Press Kit",
    crumb: "Contacto",
    updatedAt: "Maio 2026",
    intro:
      "Esta página agrega recursos para outros meios de comunicação que pretendam citar ou referenciar o nosso trabalho.",
    sections: [
      {
        heading: "Citação",
        blocks: [
          p(
            `Citações de até 50 palavras, com indicação da fonte e link para o artigo original, são autorizadas. Acima desse limite, contacte previamente redaccao@opatriota.pt.`,
          ),
        ],
      },
      {
        heading: "Logótipo e marca",
        blocks: [
          p(
            "O logótipo é fornecido em formato vectorial mediante pedido. Não é permitido alterar cores, proporções ou utilizá-lo em contextos que possam ser confundidos com endosso editorial.",
          ),
        ],
      },
      {
        heading: "Entrevistas",
        blocks: [
          p(
            "Pedidos de entrevista à direcção devem ser enviados para imprensa@opatriota.pt com contexto, prazo e meio de publicação.",
          ),
        ],
      },
    ],
  },
};

/** Sorted list of slugs — useful for generateStaticParams. */
export const STATIC_PAGE_SLUGS = Object.keys(STATIC_PAGES);
