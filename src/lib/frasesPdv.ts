// Frases da tela de entrada do PDV: uma por vez, sorteada, trocando a cada minuto. Trechos curtos com o autor ou a obra.
export type Frase = { texto: string; autor: string };

export const FRASES_PDV: Frase[] = [
  { texto: "A sorte favorece os audazes.", autor: "Virgílio, Eneida" },
  { texto: "Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que elas são difíceis.", autor: "Sêneca" },
  { texto: "A felicidade da sua vida depende da qualidade dos seus pensamentos.", autor: "Marco Aurélio, Meditações" },
  { texto: "Faça o que puder, com o que tiver, onde estiver.", autor: "Theodore Roosevelt" },
  { texto: "Somos o que repetidamente fazemos. A excelência, portanto, não é um ato, mas um hábito.", autor: "Will Durant, sobre Aristóteles" },
  { texto: "Toda guerra é ganha antes de ser travada.", autor: "Sun Tzu, A Arte da Guerra" },
  { texto: "Em meio ao caos, há também oportunidade.", autor: "Sun Tzu, A Arte da Guerra" },
  { texto: "Não importa o quão devagar você vá, desde que não pare.", autor: "Confúcio" },
  { texto: "Tempo perdido nunca mais se encontra.", autor: "Benjamin Franklin" },
  { texto: "Bem feito é melhor do que bem dito.", autor: "Benjamin Franklin" },
  { texto: "O homem diligente prospera.", autor: "Provérbios 13:4" },
  { texto: "Tudo posso naquele que me fortalece.", autor: "Filipenses 4:13" },
  { texto: "Entregue ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.", autor: "Provérbios 16:3" },
  { texto: "Nunca ofusque o mestre.", autor: "As 48 Leis do Poder · lei 1" },
  { texto: "Diga sempre menos do que o necessário.", autor: "As 48 Leis do Poder · lei 4" },
  { texto: "Proteja sua reputação com a própria vida.", autor: "As 48 Leis do Poder · lei 5" },
  { texto: "Conquiste pelas ações, nunca pela argumentação.", autor: "As 48 Leis do Poder · lei 9" },
  { texto: "Planeje até o fim.", autor: "As 48 Leis do Poder · lei 29" },
  { texto: "Concentre suas forças.", autor: "As 48 Leis do Poder · lei 23" },
  { texto: "Domine a arte do tempo certo.", autor: "As 48 Leis do Poder · lei 35" },
  { texto: "O cliente satisfeito é a melhor propaganda.", autor: "ditado do comércio" },
  { texto: "Quem não vive para servir não serve para viver.", autor: "Mahatma Gandhi (atribuída)" },
  { texto: "O sucesso é a soma de pequenos esforços repetidos dia após dia.", autor: "Robert Collier" },
  { texto: "Comece onde você está. Use o que você tem. Faça o que você pode.", autor: "Arthur Ashe" },
];

/** Índice sorteado diferente do atual (para não repetir a mesma frase em seguida). */
export function outraFrase(atual: number, total = FRASES_PDV.length, sorteio = Math.random) {
  if (total <= 1) return 0;
  const n = Math.floor(sorteio() * (total - 1));
  return n >= atual ? n + 1 : n;
}
