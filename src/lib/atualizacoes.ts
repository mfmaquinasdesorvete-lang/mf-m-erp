// Versões do ERP Line dia a dia. A lista de mudanças de cada dia vem do histórico do git na hora de montar o
// site (vite.config.ts grava em __ERP_HISTORICO__); os destaques de cada dia, em palavras simples, ficam aqui.
// Este arquivo também é lido pelo vite.config.ts: nada de navegador nem de "@/" nos imports.

export type Mudanca = { hash: string; hora: string; texto: string };
export type DiaHistorico = { dia: string; mudancas: Mudanca[] };
/** Versão em uso: número, código (hash) e data ISO do último commit; "quando" já vem em Brasília (16/10/2026 17:05). */
export type InfoVersao = { numero: string; hash: string; data: string; quando: string };

/** Formato do `git log` lido na montagem: hash, data ISO e assunto, separados por caracteres de controle. */
export const FORMATO_GIT = "%h%x1f%aI%x1f%s%x1e";

const BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Dia (AAAA-MM-DD) e hora (HH:MM) em Brasília. */
export function diaHoraBrasilia(iso: string) {
  const p = Object.fromEntries(BRASILIA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** "16/10/2026 17:05" (Brasília). */
export function dataHoraBR(iso: string) {
  const { dia, hora } = diaHoraBrasilia(iso);
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)} ${hora}`;
}

/** Saída do `git log --no-merges --format=FORMATO_GIT` → dias do primeiro ao último, mudanças na ordem do dia. */
export function agruparHistorico(saida: string): DiaHistorico[] {
  const linhas = saida.split("\x1e").map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [hash, iso, ...resto] = l.split("\x1f"); return { hash: hash?.trim(), iso: iso?.trim(), texto: resto.join(" ").replace(/\s+/g, " ").trim() }; })
    .filter((l) => l.hash && l.iso && l.texto && !Number.isNaN(Date.parse(l.iso)))
    .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
  const dias = new Map<string, Mudanca[]>();
  for (const l of linhas) {
    const { dia, hora } = diaHoraBrasilia(l.iso);
    dias.set(dia, [...(dias.get(dia) ?? []), { hash: l.hash, hora, texto: l.texto }]);
  }
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, mudancas]) => ({ dia, mudancas }));
}

/** 1.<dia de trabalho>.<mudanças do dia>: 1.9.27 é a 27ª mudança do 9º dia. */
export function numeroVersao(historico: DiaHistorico[]) {
  const ultimo = historico[historico.length - 1];
  return ultimo ? `1.${historico.length}.${ultimo.mudancas.length}` : "";
}

export type Destaque = { titulo: string; itens: string[] };

/** O que mudou em cada dia, para quem usa o ERP (a lista completa vem do histórico). */
export const DESTAQUES: Record<string, Destaque> = {
  "2026-10-08": {
    titulo: "O ERP Line entra no ar",
    itens: [
      "Vendas, produtos e estoque, financeiro, notas fiscais, clientes e fornecedores para a matriz (SC) e a filial (SP).",
      "NF-e pela Focus com o token de cada unidade, grupo IBS/CBS da Reforma Tributária e XML do Tiny importado.",
      "Importação do Tiny/Olist pela API e de clientes, fornecedores e transportadoras por planilha.",
      "Cadastros com filtros, ordenação, seleção de várias linhas e ações em lote.",
      "Pedido editável depois de aprovado (com motivo e auditoria) e notas fiscais como no Tiny, com marcadores.",
      "Ficha do cliente 360°, painel gerencial e visão geral do financeiro.",
    ],
  },
  "2026-10-09": {
    titulo: "Financeiro completo e cadastros conferidos",
    itens: [
      "Contas fixas, plano de contas, centros de custo, DRE, régua de cobrança, Pix copia e cola e página do cliente.",
      "Conciliação bancária com sugestões e aprovação em lote; recibos em PDF de duas vias.",
      "Clientes e fornecedores conferidos na Receita, WhatsApp automático e unificação de repetidos.",
      "Fretes, embalagens, etiquetas editáveis e transportadoras por marca com filiais.",
      "InfinitePay: link de pagamento com baixa automática.",
      "Menu por áreas, com acesso rápido colorido, e filtros compactos no celular.",
    ],
  },
  "2026-10-10": {
    titulo: "Backup, login e NFS-e",
    itens: [
      "Backup diário completo e criptografado, com cópia na Hostinger e quadro nas Configurações.",
      "Login com \"esqueci minha senha\", mostrar/ocultar senha e ajuda de acesso.",
      "NFS-e pela Focus a partir da ordem de serviço.",
      "Cliente que vira fornecedor e categorias dos cadastros editáveis.",
      "Celular: PDF na largura da tela, produtos em cartões e Ficha 360 sem passar da tela.",
    ],
  },
  "2026-10-11": {
    titulo: "PDV, preços e cotações",
    itens: [
      "PDV (venda de balcão) em tela própria, com comprovante de 80 mm.",
      "Formação de preço com aprovação e tabelas de preço (Marketplace, Revenda…).",
      "Cotação de compra por e-mail, com resposta online do fornecedor e mapa comparativo.",
      "Usuários com papéis adicionais e senha provisória; comissões por categoria.",
      "Frete simples no pedido e link de pagamento criado ao aprovar a venda.",
      "Cada área com a sua cor e contraste revisado nos temas claro e escuro.",
    ],
  },
  "2026-10-12": {
    titulo: "Open Finance, WhatsApp oficial e analista fiscal",
    itens: [
      "Open Finance: extrato dos bancos automático e conciliação sozinha.",
      "WhatsApp oficial: a régua de cobrança sai sem clique.",
      "Ficha técnica em vários níveis (subconjuntos com ou sem estoque próprio).",
      "Analista fiscal: auditoria, apuração estimada e estratégias legais para pagar menos imposto.",
      "Cadastro de funcionários; contas e DRE mais claros no celular.",
    ],
  },
  "2026-10-13": {
    titulo: "Painéis por área e aprovações",
    itens: [
      "Painel próprio de cada área (vendas, notas, financeiro, cadastros, assistência e fábrica) e painel das máquinas.",
      "Perfis configuráveis e o perfil Expedição, com a fila de separação e embalagem.",
      "Fluxo de aprovação antes do contador: conta a pagar só é paga depois de aprovada.",
      "Fornecedor marcado como golpe fica bloqueado para pagamento.",
      "Boleto lido pela linha digitável (com juros e multa), códigos EAN e NF-e com cBenef e ICMS desonerado.",
      "Configurações em páginas, uma para cada assunto.",
    ],
  },
  "2026-10-14": {
    titulo: "Bancos automáticos, base da My Frost e confiabilidade",
    itens: [
      "Extrato OFX por e-mail e Banco Inter pela API, para SC e SP.",
      "Base da My Frost: clientes, máquinas e OS de máquinas vendidas por ela; propostas do Tiny no ERP.",
      "Descontos com regra e senha do administrador; PDV com foto da peça.",
      "Kits de venda do Tiny e marcadores em todos os cadastros.",
      "Testes automáticos, gravação segura e erros visíveis.",
      "Menu em 8 áreas, busca geral, tela inicial por função e plano da troca do Tiny.",
    ],
  },
  "2026-10-15": {
    titulo: "Máquinas, vendas separadas e financeiro pelos extratos",
    itens: [
      "Google Shopping e Mercado Livre (vendas pagas entram sozinhas).",
      "Ficha do produto completa, tela das máquinas, serviços e técnicos por região.",
      "Produção e Compras em telas separadas; fornecedores com filiais.",
      "Venda de Peças e Venda de Máquinas separadas; licenciados e notas da My Frost na ficha do cliente.",
      "Impostos, tarifas e funcionários; entre contas e sócios; compras em marketplaces; DRE com os extratos.",
      "Avisos entre usuários com urgência e som, fotos dos usuários e NF-e de entrada emitida pela MF.",
    ],
  },
  "2026-10-16": {
    titulo: "Contador, Tiny, Mercado Livre e portal do representante",
    itens: [
      "Painel do contador com pendências, divergências e conciliação dos bancos.",
      "Histórico do Tiny: pedidos de venda, backup e ordens de compra; necessidades de compra.",
      "Mercado Livre: estoque e preço do ERP nos anúncios; metas por vendedor, estado e região.",
      "Nota de fornecedor completa, perfil Compras e NF-e de transferência SC↔SP para o Lucro Real.",
      "Teste do giga (REG-006) e técnicos parceiros com selo.",
      "Portal do representante; técnico ligado ao cliente; vendas com período, soma e ações em lote.",
      "Páginas Módulos e Atualizações, com a versão no fim do menu.",
      "Calendário de obrigações do Lucro Real no Painel do contador e no Painel fiscal; venda devolvida sai dos relatórios.",
      "Contas a pagar mais simples: uma situação por conta, um botão com o próximo passo e o resto no menu \"⋯\", visões com contagem e total no rodapé.",
    ],
  },
};

export type Versao = { numero: string; dia: string; titulo: string; itens: string[]; mudancas: Mudanca[] };

/** Versões da mais nova para a mais antiga. Sem histórico (prévia ou montagem sem git), só os destaques. */
export function versoesDoHistorico(historico: DiaHistorico[], destaques: Record<string, Destaque> = DESTAQUES): Versao[] {
  const dias = historico.length ? historico : Object.keys(destaques).sort().map((dia) => ({ dia, mudancas: [] as Mudanca[] }));
  return dias.map((d, i) => ({ numero: `1.${i + 1}`, dia: d.dia, titulo: destaques[d.dia]?.titulo ?? "", itens: destaques[d.dia]?.itens ?? [], mudancas: d.mudancas })).reverse();
}
