// Assistente dos itens do Scrum (Gestão → Scrum → item): preenche campos, detalha a descrição, monta tarefas,
// critérios de aceite, cenários (BDD) e casos de teste, resume os comentários e acha itens parecidos.
// Tudo por regras e pelo histórico do próprio ERP (sem serviço de fora): é um rascunho para a pessoa conferir antes de salvar.
import { FIBONACCI, ROTULO_TIPO, type CasoTeste, type ItemScrum, type Tarefa, type TipoItem } from "./scrum";

export type { CasoTeste, Tarefa };
/** O que o assistente lê do item (o rascunho da janela) */
export type Rascunho = {
  titulo: string; tipo: TipoItem; descricao: string; criterio_aceite: string; pontos: number | null; responsavel_id: string;
};

// ---------- texto ----------

/** Minúsculas e sem acento ("Ação" → "acao") */
export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PARADAS = new Set((
  "a o as os ao aos de do da dos das e em no na nos nas num numa um uma uns umas para pra pro por pelo pela pelos pelas " +
  "com sem que se ja so mais menos como quando onde ou seu sua seus suas nao sim tudo todo toda todos todas isso esse essa " +
  "este esta ele ela eles elas lhe me te eu voce nos vos muito bem tem ter ser vai fica deve precisa poder pode item erp line"
).split(" "));

/** Palavras que contam (sem acento, sem as pequenas, plural simples tirado) */
export function palavras(t: string): string[] {
  return normalizar(t).split(/[^a-z0-9]+/)
    .filter((p) => (p.length >= 3 || /^\d+$/.test(p)) && !PARADAS.has(p))
    .map((p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p));
}

/** Raiz curta da palavra: "importar" e "importação" viram "import"; "anexar" e "anexo", "anex" */
const raiz = (p: string) => p.slice(0, Math.max(4, Math.min(6, p.length - 2)));
const raizes = (t: string) => new Set(palavras(t).map(raiz));

/**
 * Quanto dois textos se parecem (0 a 1): raízes em comum sobre o total (Dice). Para comparar um título com um texto
 * longo, vale também a parte do título que aparece no texto (com peso menor).
 */
export function similaridade(a: string, b: string) {
  const A = raizes(a), B = raizes(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  for (const r of A) if (B.has(r)) comum++;
  if (comum < Math.min(2, A.size, B.size)) return 0;
  const dice = (2 * comum) / (A.size + B.size);
  const cobre = A.size >= 3 ? (comum / A.size) * 0.8 : 0;
  return Math.round(Math.max(dice, cobre) * 100) / 100;
}

const temAlgum = (texto: string, rx: RegExp) => rx.test(normalizar(texto));
const minuscula = (t: string) => (t ? t[0]!.toLowerCase() + t.slice(1) : t);
const semPonto = (t: string) => t.trim().replace(/[.!;:]+$/, "");
const COMPLETAR = (o_que: string) => `(complete: ${o_que})`;

// ---------- leitura do assunto ----------

type Area = { id: string; rotulo: string; tela: string; rx: RegExp; sigla?: RegExp };
/** Onde fica no ERP, pelo assunto (a primeira que bate). Siglas (OS, OP, OC) só em maiúsculas: "os" minúsculo é artigo. */
export const AREAS_ERP: Area[] = [
  { id: "fiscal", rotulo: "Notas fiscais", tela: "/notas", rx: /\b(nf-?e|nfs-?e|nota fiscal|notas fiscais|fiscal|imposto|icms|ipi|cofins|cfop|ncm|sefaz|xml|danfe|difal|cbenef)\b/ },
  { id: "assistencia", rotulo: "Assistência (OS)", tela: "/assistencia", rx: /\b(ordem de servico|ordens de servico|tecnicos?|garantias?|preventivas?|conserto|assistencia)\b/, sigla: /\bOS\b/ },
  { id: "producao", rotulo: "Produção", tela: "/producao", rx: /\b(ordem de producao|producao|fabrica|montagem|ficha tecnica|giga)\b/, sigla: /\bOP\b/ },
  { id: "compras", rotulo: "Compras", tela: "/compras", rx: /\b(compras?|ordem de compra|fornecedor(es)?|cotacao|cotacoes|necessidade)\b/, sigla: /\bOC\b/ },
  { id: "estoque", rotulo: "Produtos e estoque", tela: "/estoque", rx: /\b(estoque|produtos?|pecas?|sku|ean|inventario|giro)\b/ },
  { id: "financeiro", rotulo: "Financeiro", tela: "/financeiro", rx: /\b(financeiro|contas? a (pagar|receber)|boleto|pix|extrato|conciliacao|banco|cobranca|dre|caixa|pagamentos?|recebimentos?|mercado pago|infinitepay|inter)\b/ },
  { id: "vendas", rotulo: "Vendas", tela: "/pedidos", rx: /\b(vendas?|pedidos?|propostas?|orcamentos?|comiss(ao|oes)|vendedor(es)?|promoc(ao|oes)|mercado livre|marketplace|anuncios?|pdv|metas?)\b/ },
  { id: "expedicao", rotulo: "Expedição e fretes", tela: "/expedicao", rx: /\b(expedicao|frete|fretes|transportadoras?|etiquetas?|envio|entrega|coleta|rastreio|embalage(m|ns))\b/ },
];
const AREA_GERAL: Area = { id: "erp", rotulo: "ERP Line", tela: "/", rx: /$^/ };
export function areaDe(texto: string) {
  const t = normalizar(texto);
  return AREAS_ERP.find((a) => a.rx.test(t) || a.sigla?.test(texto)) ?? AREA_GERAL;
}

/** Quem usa, pelo assunto. O cliente só quando é ele quem faz ("cliente acompanha…"); "avisar o cliente" é a equipe. */
const PAPEIS: [RegExp, string][] = [
  [/^(o )?clientes? |\bclientes? (ve|acompanha|acessa|assina|aprova|paga|consulta|baixa|responde|escolhe)\b/, "cliente"],
  [/\btecnicos?\b/, "técnico"], [/\b(vendedor(es)?|representantes?)\b/, "vendedor"], [/\bcontador\b/, "contador"],
  [/\b(expedicao|separa(r|cao)|embala)/, "expedição"], [/\b(compras|fornecedor)/, "compras"],
  [/\b(financeiro|contas? a pagar|contas? a receber|conciliacao|cobranca|extrato)\b/, "financeiro"], [/\b(producao|montagem|fabrica)\b/, "produção"],
  [/\b(administrador|admin|dono|gerente)\b/, "administrador"],
];
const PAPEL_DA_AREA: Record<string, string> = {
  assistencia: "quem atende a assistência", vendas: "vendedor", financeiro: "financeiro", fiscal: "financeiro", compras: "compras",
  producao: "produção", estoque: "quem cuida do estoque", expedicao: "expedição",
};
export function papelDe(texto: string) {
  const t = normalizar(texto).trim();
  return PAPEIS.find(([rx]) => rx.test(t))?.[1] ?? PAPEL_DA_AREA[areaDe(texto).id] ?? "quem usa o ERP";
}

/**
 * O assunto do item: o título e o que a pessoa escreveu na descrição. As linhas que o próprio assistente põe
 * (rótulos, "(complete: …)", a lista de dúvidas e o "funciona no computador e no celular") não contam, senão
 * uma sugestão puxaria outra.
 */
export function assunto(r: { titulo: string; descricao?: string | null }) {
  const linhas: string[] = [r.titulo];
  let duvidas = false;
  for (const l of (r.descricao ?? "").split("\n")) {
    const n = normalizar(l.trim());
    if (/^duvidas para combinar/.test(n)) { duvidas = true; continue; }
    if (/^[a-z ]+:\s*$/.test(n)) { duvidas = false; continue; }
    if (duvidas || !n || n.includes("(complete:") || /^-?\s*funciona no computador e no celular/.test(n)) continue;
    if (/^(quem usa|para que|onde no erp|onde|quem e afetado|desde quando|por que|do que precisa|o que deveria acontecer):/.test(n)) continue;
    linhas.push(l);
  }
  return linhas.join("\n");
}

/** Para quê (o ganho), quando o assunto deixa claro */
const GANHOS: [RegExp, string][] = [
  [/\b(celular|iphone|android|na rua)\b/, "fazer na rua, pelo celular, sem voltar ao escritório"],
  [/\b(automatic|sozinh|agendad|todo dia|toda semana)/, "parar de fazer à mão e não esquecer"],
  [/\b(erro|falha|quebr|trava|nao funciona|nao abre|nao salva)/, "voltar a funcionar sem retrabalho"],
  [/\b(relatorio|painel|grafico|indicador|kpi|dashboard)/, "decidir olhando os números"],
  [/\b(avis|notific|lembr|whatsapp|e-?mail)/, "ninguém perder o prazo nem a informação"],
  [/\b(importa|planilha|integra|sincroniz)/, "trazer os dados sem digitar de novo"],
  [/\b(duplicad|repetid|unific)/, "ter um cadastro só, sem confusão"],
];
const ganhoDe = (texto: string) => { const t = normalizar(texto); return GANHOS.find(([rx]) => rx.test(t))?.[1] ?? null; };

/** Sinais do assunto que mudam tarefas, critérios e cenários */
export function sinais(texto: string) {
  const t = normalizar(texto);
  return {
    importar: /\b(importa|planilha|csv|xlsx|ofx)/.test(t),
    fiscal: /\b(nf-?e|nfs-?e|nota fiscal|notas fiscais|fiscal|imposto|icms|sefaz|xml|cfop|danfe)\b/.test(t),
    pdf: /\b(pdf|imprimir|impressao|danfe)\b/.test(t),
    aviso: /\b(avis|notific|lembr|whatsapp|e-?mail|mensage)/.test(t),
    automatico: /\b(automatic|sozinh|agendad|todo dia|toda semana|a cada)/.test(t),
    relatorio: /\b(relatorio|painel|grafico|lista|indicador|dashboard|total)/.test(t),
    foto: /\b(foto|imagem|anexo|anexa|arquivo|video)/.test(t),
    valor: /\b(valor|preco|r\$|total|desconto|juros|taxa|comiss)/.test(t),
    sensivel: /\b(financeiro|valor|senha|salario|fiscal|cpf|cnpj|banco|pix|permiss|acesso|admin)/.test(t),
    banco: /\b(campo novo|novo campo|tabela|cadastro de|guardar|registrar|historico)\b/.test(t),
    celular: /\b(celular|iphone|android|tablet)\b/.test(t),
    integracao: /\b(api|integra|sincroniz|mercado livre|focus|inter|pluggy|tiny|olist|infinitepay)\b/.test(t),
  };
}

// ---------- Auto-Fill ----------

/** Tipo pelo texto: problema, melhoria, tarefa ou história (null quando não dá para saber) */
export function sugerirTipo(texto: string): { tipo: TipoItem; motivo: string } | null {
  const t = normalizar(texto);
  const achou = (rx: RegExp) => t.match(rx)?.[0];
  let p = achou(/\b(erro|bug|falha|quebr\w*|trav\w*|nao funciona|nao abre|nao salva|nao aparece|sumiu|errad\w*)\b/);
  if (p) return { tipo: "bug", motivo: `tem "${p}" no texto` };
  p = achou(/^(melhorar|deixar|mais |menos |agilizar|simplificar|otimizar|padronizar|reorganizar)\w*/) ?? achou(/\b(mais rapido|mais claro|mais simples|melhoria)\b/);
  if (p) return { tipo: "melhoria", motivo: `começa a mudar algo que já existe ("${p.trim()}")` };
  p = achou(/^(configurar|cadastrar|importar|atualizar|conferir|revisar|ligar|instalar|migrar|apagar|limpar|enviar|ligar para|levantar|pagar)\b/);
  if (p) return { tipo: "tarefa", motivo: `é uma ação pontual ("${p}")` };
  return null;
}

const mediana = (ns: number[]) => { const s = [...ns].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]!; };
const fibAcima = (n: number) => FIBONACCI.find((f) => f >= n) ?? 21;

/** Itens já feitos mais parecidos com o texto (para pontos e responsável) */
function feitosParecidos(texto: string, historico: Pick<ItemScrum, "id" | "titulo" | "pontos" | "status" | "responsavel_id">[], id?: string) {
  return historico
    .filter((h) => h.id !== id && h.status === "feito")
    .map((h) => ({ h, s: similaridade(texto, h.titulo) }))
    .filter((x) => x.s >= 0.4)
    .sort((a, b) => b.s - a.s);
}

/**
 * Pontos: a mediana dos itens feitos parecidos; sem parecido, uma base pelo tipo e um degrau a mais para cada sinal de
 * trabalho grande (integração, fiscal, relatório/PDF, banco, "todas as telas", texto comprido).
 */
export function sugerirPontos(r: Pick<Rascunho, "titulo" | "descricao" | "tipo">, historico: Pick<ItemScrum, "id" | "titulo" | "pontos" | "status" | "responsavel_id">[] = [], id?: string) {
  const parecidos = feitosParecidos(r.titulo, historico, id).filter((x) => x.h.pontos != null).slice(0, 5);
  if (parecidos.length) {
    const p = fibAcima(mediana(parecidos.map((x) => x.h.pontos!)));
    return { pontos: p, motivo: `parecido com "${parecidos[0]!.h.titulo}" (${parecidos[0]!.h.pontos} pts)`, dividir: p >= 13 };
  }
  const texto = assunto(r);
  const s = sinais(texto);
  const base: Record<TipoItem, number> = { bug: 2, tarefa: 2, melhoria: 3, historia: 3 };
  let i = FIBONACCI.indexOf(base[r.tipo] as (typeof FIBONACCI)[number]);
  const motivos: string[] = [];
  if (s.integracao || s.importar) { i++; motivos.push("integração/importação"); }
  if (s.fiscal) { i++; motivos.push("fiscal"); }
  if (s.relatorio || s.pdf) { i++; motivos.push("relatório/PDF"); }
  if (s.automatico) { i++; motivos.push("roda sozinho"); }
  if (/\b(todas? as telas|todo o erp|todos os modulos|tudo)\b/.test(normalizar(texto))) { i++; motivos.push("mexe em muitas telas"); }
  if (palavras(r.titulo).length > 10 || r.descricao.split("\n").filter((l) => /^\s*([-•*]|\d+[.)])/.test(l)).length > 6) { i++; motivos.push("muita coisa junta"); }
  const pontos = FIBONACCI[Math.min(i, FIBONACCI.length - 1)]!;
  return { pontos, motivo: motivos.length ? `estimativa pelo tipo + ${motivos.join(", ")}` : "estimativa pelo tipo", dividir: pontos >= 13 };
}

/** Responsável: quem mais terminou itens parecidos */
export function sugerirResponsavel(titulo: string, historico: Pick<ItemScrum, "id" | "titulo" | "pontos" | "status" | "responsavel_id">[], id?: string) {
  const conta = new Map<string, { n: number; exemplo: string }>();
  for (const { h } of feitosParecidos(titulo, historico, id)) {
    if (!h.responsavel_id) continue;
    const c = conta.get(h.responsavel_id) ?? { n: 0, exemplo: h.titulo };
    c.n++;
    conta.set(h.responsavel_id, c);
  }
  const melhor = [...conta.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  return melhor ? { responsavel_id: melhor[0], motivo: `fez "${melhor[1].exemplo}"${melhor[1].n > 1 ? ` e mais ${melhor[1].n - 1}` : ""}` } : null;
}

export type Preenchimento = { campos: Partial<Rascunho>; motivos: string[] };

/** Auto-Fill: completa só o que está vazio (o tipo muda quando o texto deixa claro) e diz de onde tirou cada coisa */
export function autoPreencher(r: Rascunho, historico: Pick<ItemScrum, "id" | "titulo" | "pontos" | "status" | "responsavel_id">[] = [], id?: string): Preenchimento {
  const campos: Partial<Rascunho> = {};
  const motivos: string[] = [];
  const texto = assunto(r);
  const tipo = sugerirTipo(texto);
  const atual = { ...r };
  if (tipo && tipo.tipo !== r.tipo) { campos.tipo = tipo.tipo; atual.tipo = tipo.tipo; motivos.push(`Tipo: ${ROTULO_TIPO[tipo.tipo]} — ${tipo.motivo}.`); }
  if (r.pontos == null) {
    const p = sugerirPontos(atual, historico, id);
    campos.pontos = p.pontos;
    motivos.push(`Pontos: ${p.pontos} — ${p.motivo}.${p.dividir ? " Grande: vale dividir em itens menores." : ""}`);
  }
  if (!r.responsavel_id) {
    const q = sugerirResponsavel(r.titulo, historico, id);
    if (q) { campos.responsavel_id = q.responsavel_id; motivos.push(`Responsável: ${q.motivo}.`); }
  }
  if (!r.descricao.trim()) { campos.descricao = elaborar(atual); motivos.push("Descrição: rascunho pelo título — complete o que está entre parênteses."); }
  if (!r.criterio_aceite.trim()) { campos.criterio_aceite = textoLista(gerarCriterios(atual)); motivos.push("Critério de aceite: pelo tipo e pelo assunto."); }
  return { campos, motivos };
}

// ---------- Elaborator ----------

/** Dúvidas que costumam travar o item, pelo assunto */
function duvidas(texto: string) {
  const s = sinais(texto);
  const d: string[] = [];
  if (s.automatico) d.push("Quando roda e o que acontece se der erro?");
  if (s.importar) d.push("Qual arquivo de exemplo usar no teste?");
  if (s.aviso) d.push("Por qual canal (WhatsApp, e-mail, aviso no ERP) e com qual texto?");
  if (s.relatorio || s.pdf) d.push("Quais colunas ou campos precisam sair?");
  if (s.sensivel) d.push("Quem pode ver e quem pode mudar?");
  if (s.fiscal) d.push("O contador confere a regra antes de ir para produção?");
  if (!d.length) d.push("Quem confere se ficou pronto?");
  return d;
}

/** Elaborator: transforma o título numa descrição organizada (as partes que só a pessoa sabe ficam entre parênteses) */
export function elaborar(r: Pick<Rascunho, "titulo" | "tipo" | "descricao">) {
  const titulo = semPonto(r.titulo);
  const texto = assunto(r);
  const area = areaDe(texto);
  const papel = papelDe(texto);
  const s = sinais(texto);
  const onde = `${area.rotulo}${area.tela !== "/" ? ` (${area.tela})` : ""}`;
  if (r.tipo === "bug") {
    const aparelho = s.celular ? (/\biphone\b/.test(normalizar(texto)) ? "iPhone" : "celular") : COMPLETAR("computador ou celular?");
    return [
      `O que acontece: ${titulo}.`,
      `O que deveria acontecer: ${COMPLETAR("o resultado certo")}`,
      "",
      "Como repetir:",
      `1. Abrir ${onde}`,
      `2. ${COMPLETAR("o passo que dá o erro")}`,
      "3. Ver o erro (foto da tela ajuda)",
      "",
      `Onde: ${onde} · ${aparelho}`,
      `Quem é afetado: ${papel}`,
      `Desde quando: ${COMPLETAR("data ou depois de qual mudança")}`,
    ].join("\n");
  }
  if (r.tipo === "tarefa") {
    return [
      `O que fazer: ${titulo}.`,
      `Por quê: ${ganhoDe(texto) ?? COMPLETAR("o motivo")}`,
      `Onde: ${onde}`,
      `Do que precisa: ${COMPLETAR("arquivos, acessos ou dados")}`,
      "",
      "Dúvidas para combinar:",
      ...duvidas(texto).map((d) => `- ${d}`),
    ].join("\n");
  }
  return [
    `Quem usa: ${papel}`,
    `O quê: ${titulo}.`,
    `Para quê: ${ganhoDe(texto) ?? COMPLETAR("o ganho para quem usa")}`,
    `Onde no ERP: ${onde}`,
    "",
    "O que entra:",
    `- ${titulo}`,
    "- Funciona no computador e no celular",
    `- ${COMPLETAR("outro detalhe combinado")}`,
    "",
    "Fora desta entrega:",
    `- ${COMPLETAR("o que fica para depois")}`,
    "",
    "Dúvidas para combinar:",
    ...duvidas(texto).map((d) => `- ${d}`),
  ].join("\n");
}

// ---------- Smart-Task ----------

/** Linhas de lista da descrição ("- …", "1. …"), sem as partes "fora desta entrega" e "dúvidas", nem o que falta completar */
export function topicosDaDescricao(descricao: string) {
  const out: string[] = [];
  let fora = false;
  for (const linha of descricao.split("\n")) {
    const l = linha.trim();
    if (/^(fora d|duvidas|perguntas)/.test(normalizar(l))) { fora = true; continue; }
    if (/^[A-Za-zÀ-ú ]+:\s*$/.test(l)) { fora = false; continue; }
    const m = l.match(/^(?:[-•*]|\d+[.)]|\[[ x]\])\s+(.+)$/i);
    if (!fora && m && !/^\(complete/.test(m[1]!)) out.push(semPonto(m[1]!));
  }
  return out;
}

const SEM_REPETIR = <T>(lista: T[], chave: (x: T) => string) => {
  const vistos = new Set<string>();
  return lista.filter((x) => { const k = normalizar(chave(x)).replace(/\W+/g, ""); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
};

/** Smart-Task: lista de tarefas pelo tipo, pelo assunto e pelos tópicos da descrição (sem repetir as que já existem) */
export function gerarTarefas(r: Pick<Rascunho, "titulo" | "tipo" | "descricao">, existentes: Tarefa[] = []): Tarefa[] {
  const texto = assunto(r);
  const s = sinais(texto);
  const area = areaDe(texto);
  const papel = papelDe(texto);
  const t: string[] = [];
  if (r.tipo === "bug") {
    t.push("Repetir o erro seguindo os passos da descrição", "Achar a causa", "Corrigir");
    t.push("Teste automático que pega esse erro para ele não voltar");
    t.push(s.celular ? "Conferir no aparelho onde deu o erro" : "Conferir no computador e no celular");
  } else if (r.tipo === "tarefa") {
    t.push("Separar o que precisa (arquivos, acessos, dados)", `Fazer: ${semPonto(r.titulo)}`, "Conferir o resultado");
  } else {
    t.push(`Combinar os detalhes com quem pediu (${papel})`);
    if (s.banco) t.push("Banco: campo ou tabela nova, com as permissões");
    t.push(`Tela em ${area.rotulo}`);
    t.push(...topicosDaDescricao(r.descricao).filter((x) => similaridade(x, r.titulo) < 0.8 && !/^funciona no computador/.test(normalizar(x))).map((x) => `Fazer: ${x}`));
    t.push("Teste automático das contas e regras", "Conferir no celular (tela estreita) e no computador");
  }
  if (s.importar) t.push("Testar com um arquivo de exemplo", "Importar de novo e conferir que não duplica");
  if (s.fiscal) t.push("Emitir em homologação antes da produção", "Contador confere a regra");
  if (s.pdf) t.push("Conferir o PDF impresso (A4) e no celular");
  if (s.aviso) t.push("Escrever o texto da mensagem", "Testar o envio com alguém da equipe");
  if (s.automatico) t.push("Registrar no Monitor cada vez que roda");
  if (s.relatorio) t.push("Conferir os totais com uma conta feita à mão");
  if (s.foto) t.push("Testar arquivo grande e foto do iPhone");
  if (s.sensivel) t.push("Conferir com cada perfil (administrador, financeiro, vendas…)");
  if (r.tipo !== "tarefa") t.push("Escrever em Atualizações", "Publicar e avisar quem pediu");
  else t.push("Anotar no item o que foi feito");
  const novas = t.map((texto) => ({ texto, feito: false }));
  return SEM_REPETIR([...existentes, ...novas], (x) => x.texto).slice(existentes.length);
}

// ---------- Smart-Acceptance ----------

/** Smart-Acceptance: critérios de aceite (como saber que está pronto), pelo tipo e pelo assunto */
export function gerarCriterios(r: Pick<Rascunho, "titulo" | "tipo" | "descricao">): string[] {
  const texto = assunto(r);
  const s = sinais(texto);
  const c: string[] = [];
  if (r.tipo === "bug") {
    c.push("Seguindo os passos da descrição, o erro não acontece mais", "O que já funcionava continua funcionando", "Um teste automático falha se o erro voltar");
    if (s.celular) c.push("Funciona no aparelho onde o erro apareceu");
  } else if (r.tipo === "tarefa") {
    c.push(`Feito: ${semPonto(r.titulo)}`, "O que foi feito ficou anotado no item (onde e como)", "Quem pediu conferiu");
  } else {
    c.push(`Dá para fazer de ponta a ponta o que o título promete: "${semPonto(r.titulo)}"`);
    c.push("No celular nada sai da tela e os botões dão para tocar");
    c.push("Quando falta algo ou dá erro, aparece uma mensagem clara do que fazer");
  }
  if (s.sensivel) c.push("Só quem tem permissão vê e altera");
  if (s.importar) c.push("Importar o mesmo arquivo duas vezes não duplica nada");
  if (s.fiscal) c.push("A nota é autorizada em homologação e o XML confere com o esperado");
  if (s.pdf) c.push("O PDF sai com os dados certos e cabe na folha A4");
  if (s.aviso) c.push("A mensagem chega com o texto combinado e fica registrada no ERP");
  if (s.valor) c.push("Os valores batem com uma conta feita à mão (R$ com duas casas)");
  if (s.automatico) c.push("Roda sozinho no horário combinado e aparece no Monitor");
  if (s.relatorio) c.push("Filtros, ordem e exportar para Excel funcionam");
  if (s.foto) c.push("Foto grande do iPhone anexa sem erro");
  return SEM_REPETIR(c, (x) => x);
}

/** Lista em texto ("- a\n- b") */
export const textoLista = (linhas: string[]) => linhas.map((l) => `- ${l}`).join("\n");
/** Junta as linhas novas no fim do texto, sem repetir as que já estão lá */
export function juntarLinhas(atual: string, novas: string[]) {
  const ja = new Set(atual.split("\n").map((l) => normalizar(l.replace(/^\s*([-•*]|\d+[.)])\s*/, "")).replace(/\W+/g, "")).filter(Boolean));
  const faltam = novas.filter((n) => !ja.has(normalizar(n).replace(/\W+/g, "")));
  return [atual.trimEnd(), textoLista(faltam)].filter(Boolean).join("\n");
}
const linhasDe = (texto: string) => texto.split("\n").map((l) => l.replace(/^\s*([-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);

// ---------- Smart-BDD ----------

/** Smart-BDD: cenários no formato Dado / Quando / Então, em português, prontos para virar teste */
export function gerarCenarios(r: Pick<Rascunho, "titulo" | "tipo" | "descricao" | "criterio_aceite">) {
  const titulo = semPonto(r.titulo);
  const texto = assunto(r);
  const s = sinais(texto);
  const area = areaDe(texto);
  const papel = papelDe(texto);
  // no caminho principal, os critérios próprios do assunto (celular e mensagem de erro têm cenário próprio)
  const criterios = (r.criterio_aceite.trim() ? linhasDe(r.criterio_aceite) : gerarCriterios(r))
    .filter((c) => !/^(da para fazer de ponta a ponta|no celular nada sai|quando falta algo)/.test(normalizar(c)));
  if (!criterios.length) criterios.push("termino sem ajuda e vejo a confirmação na tela");
  const L: string[] = ["# language: pt"];
  if (r.tipo === "bug") {
    L.push(`Funcionalidade: Correção — ${titulo}`, "");
    L.push("  Cenário: O erro não acontece mais", `    Dado que abri ${area.rotulo}`, "    Quando repito os passos da descrição", "    Então o erro não aparece", "    E o resultado é o esperado", "");
    L.push("  Cenário: O resto continua igual", `    Dado que uso ${area.rotulo} como sempre`, "    Quando faço o caminho de todo dia", "    Então tudo funciona como antes da correção");
  } else {
    L.push(`Funcionalidade: ${titulo}`, `  Como ${papel}`, `  Quero ${minuscula(titulo)}`, `  Para ${ganhoDe(texto) ?? "ganhar tempo e errar menos"}`, "");
    L.push("  Contexto:", `    Dado que entrei no ERP Line como ${papel}`, `    E abri ${area.rotulo}`, "");
    L.push("  Cenário: Caminho principal", `    Quando faço o que o item pede: ${minuscula(titulo)}`);
    criterios.slice(0, 3).forEach((c, k) => L.push(`    ${k ? "E" : "Então"} ${minuscula(semPonto(c))}`));
    L.push("", "  Cenário: Falta uma informação", "    Quando deixo um campo obrigatório vazio e salvo", "    Então aparece uma mensagem dizendo o que falta", "    E nada fica salvo pela metade");
  }
  if (s.sensivel) L.push("", "  Cenário: Sem permissão", "    Dado que entrei com um perfil sem acesso", `    Quando abro ${area.rotulo}`, "    Então não vejo a opção nem os valores");
  if (s.importar) L.push("", "  Cenário: Importar duas vezes", "    Dado que já importei o arquivo de exemplo", "    Quando importo o mesmo arquivo de novo", "    Então nada é duplicado", "    E vejo quantas linhas foram puladas");
  if (s.fiscal) L.push("", "  Cenário: Nota em homologação", "    Dado que a unidade está em homologação", "    Quando emito a nota", "    Então a SEFAZ autoriza", "    E o XML tem os impostos certos");
  if (s.automatico) L.push("", "  Cenário: Roda sozinho", "    Dado que chegou o horário combinado", "    Quando o ERP roda a rotina", "    Então o resultado aparece sem ninguém clicar", "    E o Monitor registra a execução");
  if (s.aviso) L.push("", "  Cenário: Aviso enviado", "    Quando o evento acontece", "    Então a pessoa recebe a mensagem com o texto combinado", "    E o envio fica registrado");
  L.push("", "  Cenário: No celular", "    Dado que estou no celular", "    Quando faço o caminho principal", "    Então nada sai da tela", "    E os botões dão para tocar");
  return L.join("\n");
}

// ---------- Test-Gen ----------

/** Test-Gen: casos de teste com passos e resultado esperado, lidos dos cenários (Dado/Quando/E → passos; Então/E → esperado) */
export function gerarTestes(cenarios: string): CasoTeste[] {
  const casos: CasoTeste[] = [];
  const contexto: string[] = [];
  let atual: CasoTeste | null = null;
  let noContexto = false;
  let depoisDoEntao = false;
  for (const bruta of cenarios.split("\n")) {
    const l = bruta.trim();
    if (!l || l.startsWith("#")) continue;
    const m = l.match(/^(Contexto|Cen[áa]rio|Esquema do cen[áa]rio)\s*:\s*(.*)$/i);
    if (m) {
      noContexto = /^contexto/i.test(m[1]!);
      if (!noContexto) { atual = { nome: m[2]!.trim() || `Caso ${casos.length + 1}`, passos: [...contexto], esperado: [], ok: null }; casos.push(atual); }
      depoisDoEntao = false;
      continue;
    }
    const p = l.match(/^(Dado|Quando|Então|Entao|E|Mas)\s+(.+)$/i);
    if (!p) continue;
    const palavra = normalizar(p[1]!);
    // "Dado que entrei…" vira o passo "Entrei…"
    const sem = p[2]!.replace(/^que\s+/i, "");
    const frase = sem.charAt(0).toUpperCase() + sem.slice(1);
    if (noContexto) { contexto.push(frase); continue; }
    if (!atual) continue;
    if (palavra === "entao") depoisDoEntao = true;
    else if (palavra === "dado" || palavra === "quando") depoisDoEntao = false;
    (depoisDoEntao ? atual.esperado : atual.passos).push(frase);
  }
  return casos.filter((c) => c.passos.length || c.esperado.length);
}

/** Quantos casos passaram, falharam e faltam testar */
export const placarTestes = (testes: CasoTeste[]) => ({
  passou: testes.filter((t) => t.ok === true).length,
  falhou: testes.filter((t) => t.ok === false).length,
  falta: testes.filter((t) => t.ok == null).length,
});

// ---------- Summarizer ----------

export type Comentario = { nome: string; texto: string; created_at: string };
export type Resumo = {
  total: number; pessoas: { nome: string; n: number }[]; de: string | null; ate: string | null;
  decisoes: string[]; pendencias: string[]; perguntas: string[]; proximos: string[]; ultimo: string | null;
};

const frases = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((f) => f.trim()).filter((f) => f.length > 2);
const corta = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * Summarizer: resumo dos comentários do item — quem falou, de quando a quando, o que ficou decidido, o que está
 * travado, as perguntas sem resposta e os próximos passos (as frases mais novas primeiro, até 3 de cada).
 */
export function resumirComentarios(comentarios: Comentario[]): Resumo {
  const lista = [...comentarios].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const conta = new Map<string, number>();
  for (const c of lista) conta.set(c.nome, (conta.get(c.nome) ?? 0) + 1);
  const decisoes: string[] = [], pendencias: string[] = [], perguntas: string[] = [], proximos: string[] = [];
  lista.forEach((c, k) => {
    const primeiro = c.nome.split(" ")[0];
    for (const f of frases(c.texto)) {
      const n = normalizar(f);
      const com = `${corta(f)} — ${primeiro}`;
      if (/\?$/.test(f)) {
        // pergunta sem resposta: ninguém comentou depois
        if (k === lista.length - 1 || lista.slice(k + 1).every((d) => d.nome === c.nome)) perguntas.push(com);
      } else if (/\b(decid|combinad|combinamos|ficou|fica assim|vamos (usar|fazer|seguir)|aprovad|fechado|definid|escolh)/.test(n)) decisoes.push(com);
      else if (/\b(bloque|imped|esperando|aguard|falta|depende|travad|nao consigo|nao da|sem acesso|parad)/.test(n)) pendencias.push(com);
      else if (/\b(vou |vamos |preciso|precisamos|tem que|temos que|amanha|depois|proximo|proxima|ate (segunda|terca|quarta|quinta|sexta|amanha))/.test(n)) proximos.push(com);
    }
  });
  const ultimos = (xs: string[]) => xs.slice(-3).reverse();
  const ultimo = lista[lista.length - 1];
  return {
    total: lista.length,
    pessoas: [...conta.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n),
    de: lista[0]?.created_at ?? null, ate: ultimo?.created_at ?? null,
    decisoes: ultimos(decisoes), pendencias: ultimos(pendencias), perguntas: ultimos(perguntas), proximos: ultimos(proximos),
    ultimo: ultimo ? `${corta(ultimo.texto, 180)} — ${ultimo.nome.split(" ")[0]}` : null,
  };
}

// ---------- AI Suggest ----------

export type Candidato = { id: string; titulo: string; texto?: string | null; origem: "scrum" | "ideia" | "entregue"; detalhe: string };
export type Parecido = Candidato & { score: number };

/** AI Suggest: o que já existe parecido (itens de qualquer equipe, Ideias e o que já foi entregue), do mais parecido ao menos */
export function parecidos(titulo: string, candidatos: Candidato[], { ignorar, limite = 4, minimo = 0.4 }: { ignorar?: string; limite?: number; minimo?: number } = {}): Parecido[] {
  if (palavras(titulo).length < 2) return [];
  return candidatos
    .filter((c) => c.id !== ignorar)
    .map((c) => ({ ...c, score: Math.max(similaridade(titulo, c.titulo), c.texto ? similaridade(titulo, `${c.titulo} ${c.texto}`) * 0.9 : 0) }))
    // as entregas são frases longas: pedem um pouco mais de semelhança
    .filter((c) => c.score >= (c.origem === "entregue" ? minimo + 0.05 : minimo))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}
