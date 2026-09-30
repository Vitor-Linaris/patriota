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
  /**
   * Shows a clickable "Sumário" sidebar that jumps to each section's
   * anchor, the way dnoticias.pt's legal pages do. Opt-in per page
   * rather than automatic: it only earns its place on a page with
   * enough numbered sections to need a map — most static pages (Sobre,
   * Redacção, Imprensa) are short enough to just scroll.
   */
  sidebarToc?: boolean;
  sections: { heading: string; blocks: Block[] }[];
}

/**
 * The anchor id for a section heading, and the label the sidebar shows
 * for it. Headings here are numbered ("1. Quem é...") for cross-
 * reference between pages (see Termos §12 pointing at Privacidade
 * §6) — the sidebar itself echoes dnoticias' own, which drops the
 * numbers ("Definições", not "1. Definições").
 */
export function sectionAnchor(heading: string): string {
  return heading
    .replace(/^\d+\.\s*/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sectionLabel(heading: string): string {
  return heading.replace(/^\d+\.\s*/, "");
}

/** Every word of a section, flattened — what LegalSearch matches against. */
export function sectionPlainText(section: {
  heading: string;
  blocks: Block[];
}): string {
  const bodies = section.blocks.map((b) =>
    b.type === "p" ? b.text : b.items.join(" "),
  );
  return [section.heading, ...bodies].join(" ");
}

const p = (text: string): Block => ({ type: "p", text });
const ul = (items: string[]): Block => ({ type: "ul", items });

const SITE_NAME = "O Patriota Notícias";
const SITE_URL = "www.opatriota.pt";

/**
 * A ficha de identificação da entidade editora, repetida em Termos,
 * Privacidade e Registo ERC.
 *
 * Dados fornecidos pelo cliente em 2026-09-30 (Sérgio Costa — AdGency
 * Ads). O registo na ERC fica deliberadamente em branco: o cliente
 * confirmou que ainda não existe, não que falta perguntar — ver a
 * secção "Sobre o número de registo" na página do Registo ERC.
 *
 * Um único e-mail, geral@opatriota.pt, a pedido do cliente — via as
 * páginas legais tinham endereços diferentes consoante a secção
 * (redaccao@, privacidade@), e isso é exactamente o que ele apontou
 * como confuso. As páginas fora do Legal (Redacção, Publicidade,
 * Imprensa, Correcções) mantêm os seus próprios endereços — são canais
 * genuinamente distintos, não a ficha de identificação da entidade.
 */
function identificacaoBlocks(): Block[] {
  return [
    ul([
      "Entidade editora: VCapital, Lda.",
      "NIF / NIPC: 517267489",
      "Sede: Rua Dr. Fernão de Ornelas, n.º 56, 4.º A/C, 9050-021 Funchal",
      "Registo na Entidade Reguladora para a Comunicação Social (ERC): registo ainda não concluído — ver secção \"Registo ERC\" nesta página",
      "Director: ver página \"A nossa equipa\"",
      "Contacto geral, incluindo pedidos de protecção de dados: geral@opatriota.pt",
    ]),
  ];
}

export const STATIC_PAGES: Record<string, StaticPage> = {
  // ── LEGAL ───────────────────────────────────────────────────────
  termos: {
    slug: "termos",
    title: "Termos e Condições",
    crumb: "Legal",
    updatedAt: "Setembro 2026",
    sidebarToc: true,
    intro: `Estes Termos e Condições regulam o acesso e a utilização do website ${SITE_URL} (doravante "${SITE_NAME}" ou "Site"), da conta de leitor, dos pacotes exclusivos e de qualquer assinatura paga disponibilizada. Ao aceder ao Site ou criar conta, o utilizador declara ter lido e aceite integralmente as condições aqui descritas. Quem não concordar deve abster-se de utilizar o Site.`,
    sections: [
      {
        heading: "1. Identificação e âmbito",
        blocks: [
          ...identificacaoBlocks(),
          p(
            "Estes Termos aplicam-se a todos os visitantes, leitores registados e assinantes do Site, e complementam — sem substituir — a Política de Protecção de Dados e Privacidade, a Política de Cookies e o Estatuto Editorial, disponíveis nesta secção Legal.",
          ),
        ],
      },
      {
        heading: "2. Definições",
        blocks: [
          ul([
            '"Site" — o website em www.opatriota.pt e os serviços associados (conta de leitor, newsletter, pacotes, comentários).',
            '"Utilizador" — qualquer pessoa que aceda ao Site, com ou sem conta.',
            '"Leitor registado" — utilizador com conta de leitor criada, gratuita por omissão.',
            '"Assinante" — leitor registado com uma assinatura paga activa e/ou pacote exclusivo adquirido.',
            '"Conteúdo" — textos, fotografias, vídeos, áudios, gráficos e demais elementos publicados pela redacção.',
          ]),
        ],
      },
      {
        heading: "3. Objecto do Site",
        blocks: [
          p(
            "O Site disponibiliza notícias, reportagens, análises e opinião sobre temas de actualidade nacional e internacional. O conteúdo editorial é produzido pela redacção do jornal e por colaboradores externos devidamente identificados, nos termos do Estatuto Editorial.",
          ),
          p(
            "Uma parte do conteúdo pode estar reservada a leitores registados ou marcada como \"Conteúdo Exclusivo\", disponível apenas mediante assinatura paga ou compra do pacote em que esse conteúdo está incluído — ver secção 8.",
          ),
        ],
      },
      {
        heading: "4. Conta de leitor",
        blocks: [
          p(
            "Criar conta é gratuito e não obriga a qualquer pagamento. Ao registar-se, o utilizador compromete-se a fornecer um endereço de e-mail verdadeiro e ao qual tenha acesso — é para lá que seguem a confirmação de conta, os avisos de segurança e, se activados, os resumos de notícias.",
          ),
          p(
            "A conta é pessoal e intransmissível. O utilizador é responsável por manter a confidencialidade da sua palavra-passe e por toda a actividade realizada com a sua sessão iniciada. Suspeitando de acesso não autorizado, deve mudar a palavra-passe de imediato e contactar geral@opatriota.pt.",
          ),
          p(
            "Idade mínima: nos termos da Lei n.º 58/2019, o registo de conta está disponível a partir dos 13 anos. A compra de assinaturas ou pacotes exclusivos, por envolver um pagamento, exige capacidade legal para contratar (18 anos) ou autorização de quem exerça as responsabilidades parentais.",
          ),
        ],
      },
      {
        heading: "5. Regras de utilização",
        blocks: [
          p(
            "O utilizador compromete-se a usar o Site de boa-fé e em conformidade com a lei portuguesa. É expressamente proibido:",
          ),
          ul([
            "Reproduzir, distribuir, modificar ou comercializar conteúdo do Site sem autorização escrita prévia — ver secção 9.",
            "Utilizar mecanismos automáticos (scrapers, crawlers, bots) para extracção massiva de conteúdo ou dados.",
            "Contornar o acesso reservado a conteúdo exclusivo, partilhar credenciais de conta para esse fim, ou revender acesso a conteúdo pago.",
            "Interferir com a operação técnica do Site — tentativas de intrusão, sobrecarga deliberada, exploração de vulnerabilidades.",
            "Criar múltiplas contas para contornar uma suspensão ou limite de utilização.",
            "Publicar, através de comentários ou qualquer outro canal, conteúdo ofensivo, difamatório, discriminatório, ilegal ou contrário à dignidade humana.",
          ]),
        ],
      },
      {
        heading: "6. Comentários e conteúdo submetido pelo utilizador",
        blocks: [
          p(
            "Comentários publicados são da exclusiva responsabilidade dos seus autores — o Site não subscreve nem valida opiniões de leitores. Ao publicar um comentário, o utilizador garante que tem o direito de o fazer e concede ao Site uma licença não-exclusiva, gratuita e mundial para o exibir, no contexto do artigo comentado, enquanto esse comentário existir.",
          ),
          p("Ao comentar, o utilizador compromete-se a não publicar conteúdo que:"),
          ul([
            "Incite ao ódio, à violência ou à discriminação em razão de origem, religião, orientação sexual, deficiência ou outra característica protegida por lei.",
            "Contenha ameaças, assédio ou dados pessoais de terceiros sem o seu consentimento.",
            "Constitua spam, publicidade não solicitada ou promoção de serviços de terceiros.",
            "Seja manifestamente falso e apresentado como facto, com intenção de enganar.",
          ]),
          p(
            "A redacção reserva-se o direito de moderar, ocultar ou eliminar comentários que violem estes Termos, sem necessidade de aviso prévio.",
          ),
        ],
      },
      {
        heading: "7. Moderação, suspensão e encerramento de conta",
        blocks: [
          p(
            "A violação destas regras pode levar à suspensão temporária da conta — com indicação do motivo e da duração — ou, em caso de reincidência ou gravidade, à suspensão definitiva. O histórico de medidas anteriores sobre a mesma conta é considerado na decisão: uma segunda infracção tende a ser tratada com mais gravidade do que a primeira.",
          ),
          p(
            "Uma conta suspensa mantém acesso de leitura ao Site nos mesmos termos de um visitante sem conta, mas perde a possibilidade de comentar e, durante suspensão definitiva, de voltar a registar-se com o mesmo endereço de e-mail.",
          ),
          p(
            "O utilizador pode encerrar a sua própria conta a qualquer momento nas definições da área de leitor — ver secção 12 da Política de Protecção de Dados e Privacidade sobre o que acontece aos dados nesse caso.",
          ),
        ],
      },
      {
        heading: "8. Pacotes exclusivos e assinatura paga",
        blocks: [
          p(
            "Um pacote exclusivo é um conjunto de artigos vendido numa compra única, com acesso permanente à conta que o adquiriu — mesmo que esses artigos sejam mais tarde retirados do pacote ou reorganizados. Uma assinatura paga, quando disponibilizada, dá acesso a todo o conteúdo marcado como exclusivo enquanto estiver activa.",
          ),
          p(
            "Os pagamentos são processados pela Stripe, um prestador de serviços de pagamento terceiro. O Site nunca recebe nem armazena o número do seu cartão — ver Política de Protecção de Dados e Privacidade, secção 4.",
          ),
          p(
            "As assinaturas com renovação automática são cobradas antecipadamente, no início de cada período, e renovam-se automaticamente até serem canceladas. O cancelamento pode ser feito a qualquer momento na área de leitor, através do portal de faturação, e produz efeito no final do período já pago — não há reembolso do período em curso, salvo o disposto abaixo.",
          ),
          p(
            "Direito de livre resolução: nos termos do Decreto-Lei n.º 24/2014, o consumidor dispõe de 14 dias para desistir de uma compra à distância. Como o acesso a um pacote ou a uma assinatura é disponibilizado de imediato após o pagamento, ao confirmar a compra o utilizador reconhece e aceita expressamente a perda deste direito de livre resolução assim que o conteúdo digital é disponibilizado — em linha com a excepção prevista no artigo 17.º, alínea m), do mesmo diploma. Isto não prejudica o direito a reembolso em caso de conteúdo pago não disponibilizado por falha imputável ao Site, ou noutras situações em que a lei o exija.",
          ),
        ],
      },
      {
        heading: "9. Propriedade intelectual",
        blocks: [
          p(
            `Todo o conteúdo editorial — textos, fotografias, ilustrações, vídeos, áudios e elementos gráficos — é propriedade do ${SITE_NAME} ou dos seus autores e colaboradores, estando protegido pela legislação portuguesa e internacional sobre direitos de autor e direitos conexos.`,
          ),
          p(
            "Citações pontuais, com identificação clara da fonte e ligação para o artigo original, são permitidas ao abrigo do direito de citação. Qualquer reprodução integral, tradução, republicação ou utilização comercial requer autorização escrita prévia da redacção — ver página \"Imprensa & Press Kit\" para pedidos deste tipo.",
          ),
        ],
      },
      {
        heading: "10. Recolha automatizada e treino de inteligência artificial",
        blocks: [
          p(
            "É expressamente proibida a recolha, cópia ou reprodução do conteúdo do Site, por meios automatizados, para treinar, ajustar ou alimentar modelos de inteligência artificial ou sistemas de aprendizagem automática, sem licença escrita prévia da redacção. Esta proibição é independente e adicional às demais restrições de reprodução previstas na secção 9.",
          ),
        ],
      },
      {
        heading: "11. Ligações a terceiros",
        blocks: [
          p(
            "O Site pode conter hiperligações para sites externos, fornecidas a título de referência. O jornal não controla, subscreve nem se responsabiliza pelo conteúdo, políticas de privacidade ou práticas desses sites de terceiros.",
          ),
        ],
      },
      {
        heading: "12. Isenção de responsabilidade",
        blocks: [
          p(
            "O Site empenha-se em garantir a exactidão da informação publicada e mantém uma Política de Correcções própria. Ainda assim, não pode ser responsabilizado por erros materiais pontuais, interrupções de serviço, perdas de dados ou danos indirectos resultantes do uso ou da impossibilidade de uso dos seus conteúdos, dentro dos limites permitidos pela lei portuguesa.",
          ),
          p(
            "Nada nestes Termos exclui ou limita responsabilidade que não possa ser excluída ou limitada por lei, incluindo por dolo ou negligência grave.",
          ),
        ],
      },
      {
        heading: "13. Alterações a estes Termos",
        blocks: [
          p(
            "O jornal reserva-se o direito de modificar estes Termos a qualquer momento, para reflectir alterações ao Site ou à lei aplicável. A versão actualizada está sempre disponível nesta página, com indicação da data da última revisão no topo. Alterações substanciais que afectem assinantes activos serão comunicadas por e-mail com antecedência razoável.",
          ),
        ],
      },
      {
        heading: "14. Lei aplicável e foro",
        blocks: [
          p(
            "Estes Termos regem-se pela lei portuguesa. Em caso de litígio que não seja resolvido por via de reclamação directa, é competente o foro da comarca da sede da entidade editora, com expressa renúncia a qualquer outro, sem prejuízo dos direitos imperativos de que o consumidor disponha nos termos da lei de defesa do consumidor.",
          ),
        ],
      },
      {
        heading: "15. Contacto",
        blocks: [
          p(
            "Dúvidas sobre estes Termos podem ser dirigidas a geral@opatriota.pt. Reclamações de consumo podem também ser apresentadas junto do Centro de Arbitragem de Conflitos de Consumo da sua área de residência, ou através do Livro de Reclamações — ver rodapé do Site.",
          ),
        ],
      },
    ],
  },

  privacidade: {
    slug: "privacidade",
    title: "Protecção de Dados e Privacidade",
    crumb: "Legal",
    updatedAt: "Setembro 2026",
    sidebarToc: true,
    intro: `Esta Política descreve, de forma concreta e sem linguagem genérica, que dados pessoais o ${SITE_NAME} recolhe através da conta de leitor, da newsletter e da navegação no Site, para quê, com que base legal, durante quanto tempo, e como pode exercer os seus direitos — em conformidade com o Regulamento Geral sobre a Protecção de Dados (RGPD) e a Lei n.º 58/2019.`,
    sections: [
      {
        heading: "1. Quem é o responsável pelo tratamento",
        blocks: identificacaoBlocks(),
      },
      {
        heading: "2. Que dados recolhemos, e para quê",
        blocks: [
          p(
            "Em vez de uma lista genérica, descrevemos cada situação concreta em que recolhemos dados:",
          ),
          p("a) Conta de leitor (gratuita)"),
          ul([
            "Endereço de e-mail (obrigatório) e nome (opcional) — para criar e identificar a conta, e confirmar o registo.",
            "Palavra-passe — nunca guardada em texto simples; apenas o resultado de uma função de derivação segura (hash), que não pode ser revertido para a palavra-passe original.",
            "Categorias seguidas e preferências de notificação — para lhe enviar avisos de artigo novo, se assim escolher.",
            "Artigos guardados e histórico de leitura — visíveis apenas para si, na sua área de leitor.",
          ]),
          p("b) Comentários"),
          ul([
            "O texto do comentário, associado à sua conta e visível publicamente no artigo.",
            "Se uma conta for suspensa por violar as regras de comentários, guardamos o motivo e a duração da suspensão, associados a essa conta — para decidir com justiça se há reincidência numa futura infracção.",
          ]),
          p("c) Pacotes exclusivos e assinatura paga"),
          ul([
            "Processados directamente pela Stripe (prestador de serviços de pagamento) — o Site nunca vê nem armazena o número do seu cartão.",
            "Recebemos da Stripe apenas a confirmação do pagamento e um identificador de cliente, para lhe dar acesso ao conteúdo comprado.",
            "Se pedir factura com NIF, esse dado é gerido directamente pela Stripe para efeitos de faturação.",
          ]),
          p("d) Newsletter"),
          ul([
            "Endereço de e-mail, apenas se subscrever voluntariamente.",
            "Cada e-mail enviado inclui uma ligação de cancelamento imediato, sem necessidade de sessão iniciada nem de justificação.",
          ]),
          p("e) Dados técnicos e de segurança"),
          ul([
            "Para medir visitantes únicos do Site, calculamos um resumo (hash) do seu endereço IP e do seu navegador — não é um cookie, é um cálculo feito a cada pedido, e o endereço IP original não é guardado. Os totais agregados são conservados 90 dias.",
            "O mesmo tipo de informação é usado para limitar tentativas abusivas (por exemplo, muitas tentativas de início de sessão seguidas), como medida de segurança.",
          ]),
          p(
            "Não recolhemos categorias especiais de dados (saúde, opinião política, orientação sexual, origem racial ou étnica, convicções religiosas) por nenhum destes meios.",
          ),
        ],
      },
      {
        heading: "3. Base legal de cada tratamento",
        blocks: [
          ul([
            "Conta de leitor e comentários — execução do contrato que aceita ao criar conta (estes Termos).",
            "Newsletter — o seu consentimento expresso, dado ao subscrever, revogável a qualquer momento.",
            "Pagamentos e faturação — execução do contrato de compra e cumprimento de obrigações legais fiscais.",
            "Histórico de moderação — o nosso interesse legítimo em aplicar as regras de utilização de forma consistente e proporcional.",
            "Medição de visitantes e segurança — o nosso interesse legítimo em perceber o funcionamento do Site e prevenir abuso, com o impacto mínimo sobre a sua privacidade (dado não guardado em bruto, apenas o resumo).",
          ]),
        ],
      },
      {
        heading: "4. Com quem partilhamos dados",
        blocks: [
          p(
            "Os seus dados nunca são vendidos. Partilhamos apenas o estritamente necessário com prestadores de serviço que actuam em nosso nome, sob contrato:",
          ),
          ul([
            "Stripe — processamento de pagamentos de pacotes e assinaturas.",
            "Brevo — envio de e-mails transaccionais (confirmação de conta, recuperação de password) e da newsletter, quando subscrita.",
            "Meta (Facebook e Instagram) — apenas para publicar automaticamente as capas e os títulos dos artigos já publicados nas redes sociais do jornal; este envio não inclui qualquer dado pessoal de leitores.",
          ]),
          p(
            "Podemos ainda divulgar dados quando a lei o exigir, ou a pedido de autoridade judicial ou administrativa competente.",
          ),
        ],
      },
      {
        heading: "5. Transferências internacionais",
        blocks: [
          p(
            "A Stripe e a Brevo podem processar dados em servidores fora do Espaço Económico Europeu. Nesses casos, a transferência assenta em Cláusulas Contratuais-Tipo aprovadas pela Comissão Europeia ou noutro mecanismo de adequação reconhecido pelo RGPD.",
          ),
        ],
      },
      {
        heading: "6. Durante quanto tempo conservamos os dados",
        blocks: [
          p(
            "Enquanto a conta estiver activa, os dados descritos na secção 2 são conservados para prestar o serviço. Ao pedir o encerramento da conta:",
          ),
          ul([
            "O histórico de leitura, os artigos guardados, as categorias seguidas e o histórico de moderação são apagados de imediato.",
            "O endereço de e-mail, o nome e a palavra-passe são substituídos por valores anónimos — a conta deixa de o identificar.",
            "Os comentários que deixou permanecem visíveis, para não deixar buracos nas conversas de outras pessoas, mas passam a mostrar \"Leitor removido\" em vez do seu nome.",
            "Se tiver uma assinatura activa associada à Stripe, a ligação a essa conta é desfeita nesse momento.",
          ]),
          p(
            "Os dados de facturação são conservados pelo prazo exigido pela lei fiscal portuguesa, independentemente do encerramento da conta.",
          ),
          p(
            "Os totais agregados de visitantes únicos (secção 2.e) são conservados 90 dias e depois eliminados automaticamente.",
          ),
        ],
      },
      {
        heading: "7. Os seus direitos",
        blocks: [
          p("Ao abrigo do RGPD, tem direito a:"),
          ul([
            "Aceder aos dados que temos sobre si.",
            "Rectificar dados incorrectos — pode fazê-lo directamente nas definições da sua conta, para nome e e-mail.",
            "Pedir o apagamento (que aplicamos por anonimização — ver secção 6) directamente nas definições da conta, em \"Apagar conta\".",
            "Pedir a portabilidade dos seus dados num formato estruturado.",
            "Opor-se a um tratamento específico, ou retirar o consentimento dado à newsletter, a qualquer momento e sem custos.",
            "Apresentar reclamação junto da Comissão Nacional de Protecção de Dados (CNPD) — www.cnpd.pt — se considerar que os seus direitos não foram respeitados.",
          ]),
          p(
            "Para pedidos que não possam ser feitos directamente na sua área de leitor, escreva para geral@opatriota.pt. Respondemos no prazo de um mês, salvo pedidos particularmente complexos, caso em que o prazo pode ser prorrogado e explicaremos porquê.",
          ),
        ],
      },
      {
        heading: "8. Menores",
        blocks: [
          p(
            "O registo de conta está disponível a partir dos 13 anos, nos termos da Lei n.º 58/2019 — ver secção 4 dos Termos e Condições. Não recolhemos deliberadamente dados de crianças com menos de 13 anos; se tomarmos conhecimento de uma conta nessas condições, procederemos ao seu encerramento.",
          ),
        ],
      },
      {
        heading: "9. Segurança",
        blocks: [
          p(
            "Adoptamos medidas técnicas e organizativas para proteger os seus dados: ligação encriptada (HTTPS) em todo o Site, palavras-passe guardadas apenas como hash, controlo de acessos por função dentro da redacção, e nunca armazenamos dados de cartão de pagamento — essa informação fica inteiramente do lado da Stripe.",
          ),
          p(
            "Em caso de violação de dados pessoais com risco para os seus direitos e liberdades, notificaremos a CNPD no prazo legal de 72 horas e, quando o risco for elevado, notificá-lo-emos também directamente.",
          ),
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          p(
            "A utilização de cookies e tecnologias semelhantes está descrita em detalhe na nossa Política de Cookies, disponível nesta secção Legal.",
          ),
        ],
      },
      {
        heading: "11. Decisões automatizadas",
        blocks: [
          p(
            "Não tomamos decisões sobre si baseadas exclusivamente em tratamento automatizado que produzam efeitos jurídicos ou o afectem significativamente. A moderação de comentários envolve sempre uma pessoa da redacção.",
          ),
        ],
      },
      {
        heading: "12. Alterações a esta Política",
        blocks: [
          p(
            "Esta Política pode ser actualizada para reflectir alterações ao Site ou à lei aplicável. A data da última revisão está sempre indicada no topo desta página. Alterações substanciais serão comunicadas aos leitores registados por e-mail.",
          ),
        ],
      },
      {
        heading: "13. Contacto",
        blocks: [
          p(
            "Para qualquer questão sobre esta Política ou sobre o tratamento dos seus dados, escreva para geral@opatriota.pt.",
          ),
        ],
      },
    ],
  },

  cookies: {
    slug: "cookies",
    title: "Política de Cookies",
    crumb: "Legal",
    updatedAt: "Setembro 2026",
    sidebarToc: true,
    intro: `Esta Política explica, de forma concreta, o que são cookies e tecnologias semelhantes, exactamente quais utilizamos no ${SITE_NAME}, para quê, e como pode geri-las.`,
    sections: [
      {
        heading: "O que são cookies e tecnologias semelhantes",
        blocks: [
          p(
            "Um cookie é um pequeno ficheiro de texto que o navegador guarda no seu dispositivo quando visita um site. O Site também usa duas tecnologias semelhantes com o mesmo efeito prático — guardar uma pequena informação no seu navegador: o localStorage (mantém-se entre visitas) e o sessionStorage (apaga-se quando fecha o separador ou o navegador). Tratamo-las aqui todas da mesma forma, com o mesmo nível de transparência.",
          ),
        ],
      },
      {
        heading: "Cookies e armazenamento estritamente necessários",
        blocks: [
          p(
            "Não pedem consentimento porque, sem eles, funcionalidades que o próprio utilizador pediu deixam de funcionar:",
          ),
          ul([
            "Sessão de leitor — mantém-no com sessão iniciada na sua conta, depois de fazer login.",
            "Sessão de administração — usada apenas por jornalistas e equipa editorial, para aceder à área de gestão do Site.",
            "Registo da sua escolha neste aviso de cookies — para não voltarmos a perguntar a cada visita.",
          ]),
        ],
      },
      {
        heading: "Preferências (não essenciais, de baixo impacto)",
        blocks: [
          p(
            "Guardadas no seu navegador para lembrar pequenas escolhas de utilização — não identificam quem é nem são partilhadas com ninguém:",
          ),
          ul([
            "Se já viu o anúncio que aparece uma vez, algum tempo depois de chegar ao Site — para não voltar a mostrar-lho na mesma visita.",
            "Se já dispensou o anúncio fixo no fundo do ecrã, nessa visita.",
          ]),
        ],
      },
      {
        heading: "Medição de visitantes — e porque não é um cookie",
        blocks: [
          p(
            "Para saber quantas pessoas diferentes visitam o Site por dia, calculamos um resumo (hash) do seu endereço IP e do seu navegador, a cada pedido — sem guardar o endereço IP em si, e sem gravar nada no seu navegador. É uma medição feita do nosso lado, não uma cookie. Os totais agregados são conservados durante 90 dias.",
          ),
          p(
            "Não usamos o Google Analytics nem qualquer ferramenta de análise de terceiros.",
          ),
        ],
      },
      {
        heading: "Publicidade",
        blocks: [
          p(
            "Os anúncios apresentados no Site são geridos directamente pela nossa equipa comercial — imagens ou blocos que carregamos nós próprios, não uma rede de publicidade automatizada. Não colocamos, actualmente, cookies de publicidade nem partilhamos dados de navegação com redes de tracking externas.",
          ),
          p(
            "Se isto vier a mudar — por exemplo, ao integrar uma rede de publicidade externa — esta Política e o aviso de cookies serão actualizados antes dessa mudança entrar em vigor, nunca depois.",
          ),
        ],
      },
      {
        heading: "Como gerir as suas escolhas",
        blocks: [
          p(
            "O aviso de cookies que aparece na sua primeira visita regista a sua aceitação por 180 dias, findos os quais voltamos a perguntar. Pode também bloquear ou eliminar cookies e dados de sites a qualquer momento nas definições do seu navegador — nesse caso, algumas funcionalidades que dependem de sessão iniciada (como a sua conta de leitor ou a área de administração) deixam de funcionar correctamente até voltar a aceitar.",
          ),
        ],
      },
      {
        heading: "Alterações a esta Política",
        blocks: [
          p(
            "Esta Política pode ser actualizada para reflectir alterações às tecnologias que usamos. A data da última revisão está sempre indicada no topo desta página.",
          ),
        ],
      },
    ],
  },

  erc: {
    slug: "erc",
    title: "Registo ERC",
    crumb: "Legal",
    updatedAt: "Setembro 2026",
    intro: `${SITE_NAME} é um órgão de comunicação social em formato digital, sujeito ao registo junto da Entidade Reguladora para a Comunicação Social (ERC), nos termos da Lei n.º 2/99 (Lei de Imprensa) e da Lei n.º 53/2005.`,
    sections: [
      {
        heading: "Ficha de registo",
        blocks: [
          ul([
            `Denominação: ${SITE_NAME}`,
            "Tipo: Publicação periódica online",
            "Periodicidade: Diária",
            "Âmbito territorial: Portugal",
            "Número de registo ERC: ainda não atribuído — ver nota abaixo",
            "Estatuto editorial: ver página dedicada",
            "Entidade proprietária e director: ver ficha de identificação nos Termos e Condições e em \"A nossa equipa\"",
          ]),
          p(
            "A ficha técnica completa está disponível mediante pedido em geral@opatriota.pt.",
          ),
        ],
      },
      {
        heading: "Sobre o número de registo",
        blocks: [
          p(
            "Um órgão de comunicação social só pode operar legalmente depois de concluído o registo na ERC. O processo de registo está em curso; esta página será actualizada com o número assim que for atribuído — a Lei de Imprensa exige que esta informação esteja acessível e correcta, e por isso não inventamos um número antes de o termos.",
          ),
        ],
      },
      {
        heading: "Contactos para reclamações",
        blocks: [
          p(
            "Reclamações relativas a conteúdos podem ser dirigidas à redacção em correcoes@opatriota.pt, nos termos da Política de Correcções. Em caso de discordância com a resposta da redacção, o leitor pode recorrer à ERC — www.erc.pt.",
          ),
        ],
      },
    ],
  },

  /**
   * Lei n.º 19/2018 (Lei da Transparência dos Meios de Comunicação
   * Social) obriga órgãos de comunicação social a publicar, todos os
   * anos, um conjunto de dados financeiros concretos — não uma
   * descrição qualitativa das fontes de financiamento, que já está na
   * página "Transparência" (Editorial). São coisas diferentes: aquela
   * explica COMO o jornal se sustenta; esta publica OS NÚMEROS.
   *
   * Os valores ficam em branco de propósito — são figuras contabilísticas
   * reais (capital próprio, activo, passivo, EBITDA, resultados), não
   * inventáveis, e nem sequer está confirmado que esta lei se aplica ao
   * porte actual da empresa (depende de volume de negócios/dimensão).
   * Antes de publicar esta página, confirmar com o cliente/contabilista:
   * (1) se a lei se aplica; (2) os valores reais, do último exercício.
   */
  "lei-da-transparencia": {
    slug: "lei-da-transparencia",
    title: "Lei da Transparência",
    crumb: "Legal",
    updatedAt: "Setembro 2026",
    sidebarToc: true,
    intro: `A Lei n.º 19/2018 obriga os órgãos de comunicação social a publicar anualmente um conjunto de dados financeiros, para que qualquer leitor possa perceber quem é o proprietário e como o órgão se sustenta. Esta página existe para cumprir essa obrigação — ver nota sobre a sua aplicabilidade abaixo.`,
    sections: [
      {
        heading: "Aplicabilidade desta lei",
        blocks: [
          p(
            "Está a ser confirmado com o cliente se, ao porte actual da empresa, esta obrigação se aplica — a Lei n.º 19/2018 tem critérios próprios de dimensão e volume de negócios. Enquanto essa confirmação não chega, esta página assume que se aplica, por prudência, e os campos abaixo ficam por preencher.",
          ),
        ],
      },
      {
        heading: "Titularidade e financiamento",
        blocks: [
          p(
            "A identidade da entidade proprietária está na ficha de identificação, disponível nos Termos e Condições. As fontes de financiamento (publicidade, subscrições, parcerias) estão descritas, de forma qualitativa, na página Transparência.",
          ),
        ],
      },
      {
        heading: "Dados financeiros do último exercício",
        blocks: [
          ul([
            "Capital próprio: a confirmar com o cliente/contabilista",
            "Activo total: a confirmar com o cliente/contabilista",
            "Passivo total: a confirmar com o cliente/contabilista",
            "Resultados operacionais (EBITDA): a confirmar com o cliente/contabilista",
            "Resultados líquidos: a confirmar com o cliente/contabilista",
            "Montante dos rendimentos totais: a confirmar com o cliente/contabilista",
          ]),
          p(
            "Estes valores são retirados das contas anuais da empresa e não podem ser estimados nem inventados — a lei exige que sejam os reais. Serão publicados assim que fornecidos.",
          ),
        ],
      },
      {
        heading: "Alterações a esta página",
        blocks: [
          p(
            "Os dados financeiros são actualizados uma vez por ano, após o encerramento de cada exercício. A data da última revisão está sempre indicada no topo desta página.",
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
            `${SITE_NAME} é um jornal generalista online, independente, comprometido com o rigor informativo e o serviço público. Cobre temas de actualidade nacional e internacional, com particular atenção à política, economia, sociedade, mundo, cultura e investigação.`,
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
    intro: `${SITE_NAME} é feito por uma redacção pequena e dedicada, com colaboradores externos de várias áreas. A lista completa será publicada à medida que a equipa se consolide.`,
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
