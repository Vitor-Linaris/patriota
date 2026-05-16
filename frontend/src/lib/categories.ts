export interface CategoryDef {
  slug: string;
  label: string;
  description: string;
  subtopics: string[];
}

/**
 * Catalogue of editorial categories. The slug is the URL-safe identifier
 * used by /categoria/[slug]; the label is what appears in the menu and as
 * the H1 on the category page. When the articles backend lands we'll move
 * this list to the database, but having it in code keeps routing and the
 * menu in sync today.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    slug: "ultima-hora",
    label: "Última Hora",
    description: "As notícias mais recentes em desenvolvimento.",
    subtopics: ["Política", "Economia", "Sociedade", "Mundo"],
  },
  {
    slug: "politica",
    label: "Política",
    description: "Parlamento, governo, partidos e eleições em Portugal.",
    subtopics: [
      "Orçamento 2026",
      "Parlamento",
      "Governo",
      "Partidos",
      "Eleições",
      "Diplomacia",
    ],
  },
  {
    slug: "economia",
    label: "Economia",
    description: "Análise económica, mercados, empresas e finanças públicas.",
    subtopics: [
      "Orçamento 2026",
      "Parlamento",
      "Governo",
      "Partidos",
      "Eleições",
      "Diplomacia",
    ],
  },
  {
    slug: "sociedade",
    label: "Sociedade",
    description: "Habitação, trabalho, saúde e os temas do dia a dia.",
    subtopics: ["Habitação", "Trabalho", "Educação", "Saúde", "Imigração"],
  },
  {
    slug: "investigacao",
    label: "Investigação",
    description: "Jornalismo de investigação e dados em profundidade.",
    subtopics: ["A21", "Entrelinhas", "Contratos", "Dados"],
  },
  {
    slug: "opiniao",
    label: "Opinião",
    description: "Colunistas, análises e cartas dos leitores.",
    subtopics: ["Editorial", "Colunistas", "Cartas"],
  },
  {
    slug: "multimedia",
    label: "Multimédia",
    description: "Vídeo, podcast, fotorreportagem e infografia.",
    subtopics: ["Vídeo", "Podcast", "Fotorreportagem", "Infografia"],
  },
  {
    slug: "portugal",
    label: "Portugal",
    description: "Tudo o que se passa em território nacional.",
    subtopics: ["Lisboa", "Porto", "Regiões", "Ilhas"],
  },
  {
    slug: "mundo",
    label: "Mundo",
    description: "Política internacional, conflitos e diplomacia global.",
    subtopics: ["Europa", "Américas", "África", "Ásia", "Médio Oriente"],
  },
  {
    slug: "justica",
    label: "Justiça",
    description: "Tribunais, processos e o estado de direito.",
    subtopics: ["Tribunais", "Ministério Público", "Casos", "Reformas"],
  },
  {
    slug: "tecnologia",
    label: "Tecnologia",
    description: "IA, startups, regulação digital e telecomunicações.",
    subtopics: ["IA", "Startups", "Regulação", "Telecomunicações"],
  },
  {
    slug: "saude",
    label: "Saúde",
    description: "SNS, doenças, prevenção e políticas de saúde.",
    subtopics: ["SNS", "Prevenção", "Investigação", "Políticas"],
  },
  {
    slug: "cultura",
    label: "Cultura",
    description: "Livros, cinema, música e espetáculos.",
    subtopics: ["Livros", "Cinema", "Música", "Teatro", "Artes"],
  },
  {
    slug: "desporto",
    label: "Desporto",
    description: "Futebol, modalidades e cobertura olímpica.",
    subtopics: ["Futebol", "Modalidades", "Olímpicos", "Análise"],
  },
];

export function getCategoryBySlug(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
