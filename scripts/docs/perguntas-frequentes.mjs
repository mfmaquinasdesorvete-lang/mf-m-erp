// docs/perguntas-frequentes.md: "como faço para…", com a resposta montada a partir dos processos (esquemas.ts)
// e das partes das telas (modulosDetalhe.ts). Aqui fica só a pergunta e de onde vem a resposta: se a tela, a parte
// ou o processo sumir do código, o gerador para com erro e a pergunta precisa ser revista.
import {
  ONDE_ABRE, PAGINAS_POR_LINK, SOBRE_TELAS, documento, item, nomeTela, ondeFica, parteDa, passo, processo, quemVe, todosItens,
} from "./base.mjs";

/** tema → perguntas. proc: id do processo; tela + partes: nomes das partes da tela; link: página aberta por link. */
const TEMAS = [
  ["Vendas", [
    { p: "Como faço um orçamento e mando para o cliente?", proc: "proposta", tela: "/pedidos", partes: ["Orçamento", "Proposta", "PDF e WhatsApp"] },
    { p: "Como aprovo a venda e recebo o pagamento?", tela: "/pedidos", partes: ["Aprovar venda", "Pagamento", "Link de pagamento"] },
    { p: "Como emito a NF-e de uma venda?", tela: "/pedidos", partes: ["NF-e"], tela2: "/notas", partes2: ["Emitir NF-e", "Conferência antes de enviar"] },
    { p: "Como vendo no balcão?", proc: "pdv", tela: "/pdv", partes: ["Caixa", "Finalizar (F2)", "Atalhos de teclado"] },
    { p: "Como vendo uma máquina?", proc: "venda-maquina" },
    { p: "As vendas do Mercado Livre entram sozinhas?", proc: "mercado-livre", tela: "/mercado-livre", partes: ["Vendas automáticas", "Envio do estoque"] },
    { p: "Como funciona a comissão do vendedor?", proc: "comissao", tela: "/comissoes", partes: ["Comissão automática", "Quando sai"] },
  ]],
  ["Clientes", [
    { p: "Como cadastro um cliente novo?", proc: "cliente-novo", tela: "/clientes", partes: ["Cliente novo passo a passo", "Receita"] },
    { p: "Como peço para o cliente conferir e assinar a ficha?", link: "/ficha/…" },
    { p: "Onde vejo tudo de um cliente num lugar só?", tela: "/tudo-do-cliente" },
    { p: "Como o cliente paga uma conta em aberto sozinho?", link: "/cliente/…" },
  ]],
  ["Entrega", [
    { p: "Como separo, embalo e despacho um pedido?", tela: "/expedicao", partes: ["Fila de pedidos", "Conferência com leitor", "Embalar", "Despachar"] },
    { p: "Como cotar o frete?", tela: "/fretes", partes: ["Pedido de cotação padronizado", "Cotações lado a lado", "Agendar a coleta"] },
    { p: "Como mando o código de rastreio ao cliente?", proc: "rastreio", tela: "/rastreio", partes: ["Mandar pelo WhatsApp"] },
  ]],
  ["Assistência", [
    { p: "Como abro uma ordem de serviço (OS)?", proc: "assistencia", tela: "/assistencia", partes: ["Atendimento", "Garantia na hora", "Checklist de recepção"] },
    { p: "Como sei se a máquina do cliente está na garantia?", tela: "/garantias", partes: ["Máquinas vendidas", "Cartões que filtram"] },
    { p: "Como lembro os clientes da preventiva?", proc: "preventiva", tela: "/garantias", partes: ["Lembrar clientes", "WhatsApp com mensagem pronta"] },
    { p: "Como emito a nota de serviço (NFS-e) da OS?", proc: "nfse" },
  ]],
  ["Fábrica, estoque e compras", [
    { p: "Como compro as peças que estão faltando?", proc: "compra", tela: "/compras", partes: ["Necessidade de Compra", "Cotação por e-mail e WhatsApp", "Mapa comparativo"] },
    { p: "Como abro uma ordem de produção (OP)?", proc: "producao", tela: "/producao", partes: ["Nova OP", "Peças necessárias", "Pedir as peças que faltam"] },
    { p: "Como registro o teste do giga de uma máquina?", tela: "/teste-giga", partes: ["Lançar teste na bancada", "Resultado em botões grandes"] },
    { p: "Como mando mercadoria de SC para SP?", proc: "transferencia" },
    { p: "Como faço a contagem do estoque?", tela: "/estoque", partes: ["Aba Contagem", "Movimentar estoque"] },
  ]],
  ["Financeiro", [
    { p: "Como lanço uma conta a pagar?", proc: "pagar", tela: "/financeiro", partes: ["Conta nova a pagar", "Boleto lido", "Trava contra golpe"] },
    { p: "Por que a conta ainda não pode ser paga?", tela: "/aprovacoes", partes: ["Trava no pagamento", "1ª e 2ª revisão"] },
    { p: "Como cobro um cliente atrasado?", proc: "cobranca", tela: "/financeiro", partes: ["Cobrar no WhatsApp", "Régua de cobrança automática"] },
    { p: "Como importo o extrato do banco e concilio?", proc: "conciliacao", tela: "/conciliacao", partes: ["Importar extrato", "Conciliação sozinha", "Sugestões"] },
    { p: "Entrou um dinheiro no banco e não sei de quem é. E agora?", proc: "entradas" },
    { p: "Gastei no cartão da empresa. O que faço?", proc: "cartao-empresa" },
  ]],
  ["Notas e contador", [
    { p: "Chegou a nota do fornecedor. O que faço?", proc: "nf-fornecedor", tela: "/notas", partes: ["Buscar notas na SEFAZ"] },
    { p: "Como faço a devolução de uma venda?", proc: "devolucao" },
    { p: "Como o mês é fechado com o contador?", proc: "fechamento", tela: "/contador", partes: ["Baixar pacote", "Fechar o mês"] },
    { p: "Como acompanho um parcelamento de imposto?", proc: "parcelamento" },
  ]],
  ["O ERP", [
    { p: "Como dou acesso ao ERP para alguém novo?", proc: "acesso", extra: "O passo a passo completo está no documento [Como dar acesso a alguém novo](acesso-novo.md)." },
    { p: "Esqueci a senha. Como entro?", tela: "/usuarios", partes: ["Nova senha", "Senha provisória"], extra: "Peça a nova senha a quem cuida dos usuários do ERP." },
    { p: "Tenho uma ideia para melhorar o ERP. Onde anoto?", proc: "mudanca", tela: "/sobre", partes: ["Anotar ideia"] },
    { p: "Quero saber o que uma tela faz. Onde vejo?", extra: "No documento [Módulos do ERP Line](modulos.md), ou no ERP em Sobre o ERP Line → Módulos, com a busca e o \"Saiba mais\" de cada tela." },
  ]],
];

export function gerarPerguntasFrequentes({ ancoras }) {
  const d = documento();
  const temas = TEMAS.map(([nome, ps]) => ({ nome, ancora: d.ancora(nome), ps: ps.map((q) => ({ ...q, ancora: d.ancora(q.p) })) }));
  const ancOnde = d.ancora("Onde fica a tela?");
  const n = temas.reduce((s, t) => s + t.ps.length, 0);
  const noMenu = (to) => todosItens.some((i) => i.to === to);
  const linkTela = (to) => (ancoras[to] ? `[${nomeTela(to)}](modulos.md#${ancoras[to]})` : nomeTela(to));

  d.cabecalho("Perguntas frequentes", "a lista de perguntas fica em scripts/docs/perguntas-frequentes.mjs; as respostas vêm de src/lib/esquemas.ts e src/lib/modulosDetalhe.ts",
    `**${n} perguntas**`,
    "As dúvidas mais comuns do dia a dia, com a resposta curta: o passo a passo, quem faz cada passo e em qual tela. "
    + "Toque no nome de uma tela para ver tudo o que ela faz no documento [Módulos do ERP Line](modulos.md).");

  d.push("## Índice", "");
  for (const t of temas) {
    d.push(`- [${t.nome}](#${t.ancora})`);
    for (const q of t.ps) d.push(`  - [${q.p}](#${q.ancora})`);
  }
  d.push(`- [Onde fica a tela?](#${ancOnde})`, "");

  const partes = (lista) => {
    for (const [to, nome] of lista) d.push(`- **${nome}:** ${parteDa(to, nome)}`);
    if (lista.length) d.push("");
  };
  for (const t of temas) {
    d.push(`## ${t.nome}`, "");
    for (const q of t.ps) {
      d.push(`### ${q.p}`, "");
      if (q.proc) {
        const pr = processo(q.proc);
        d.push(`${pr.resumo} Passo a passo:`, "");
        pr.passos.forEach((s, k) => d.push(`${k + 1}. ${passo(s)}`));
        d.push("");
      }
      if (q.link) {
        const pg = PAGINAS_POR_LINK.find((x) => x.caminho === q.link);
        if (!pg) throw new Error(`a página por link ${q.link} não existe mais (src/lib/modulos.ts)`);
        d.push(`Pela página **${pg.nome}**, que abre por um link, sem entrar no ERP. ${pg.texto}`, "");
        d.push(`- **Quem recebe:** ${pg.quem}`, `- **Onde a equipe gera o link:** ${pg.onde}`, "");
      }
      if (q.tela && !q.partes) d.push(`${linkTela(q.tela)}: ${SOBRE_TELAS[q.tela] ?? ""}`, "");
      partes([...(q.partes ?? []).map((n) => [q.tela, n]), ...(q.partes2 ?? []).map((n) => [q.tela2, n])]);
      if (q.extra) d.push(q.extra, "");
      for (const to of [q.tela, q.tela2].filter((x) => x && noMenu(x))) {
        d.push(`_Tela ${linkTela(to)}: ${ondeFica(to)}. Quem pode abrir: ${quemVe(item(to))}._`, "");
      }
    }
  }

  d.push("## Onde fica a tela?", "");
  d.push("Telas que não estão na lista do menu e por onde se chega nelas. Todas também aparecem na busca do menu.", "");
  for (const [to, onde] of Object.entries(ONDE_ABRE)) if (noMenu(to)) d.push(`- **${linkTela(to)}:** ${onde}`);
  d.push("");
  return { arquivo: "perguntas-frequentes.md", titulo: "Perguntas frequentes", sobre: "As dúvidas do dia a dia (vendas, clientes, entrega, assistência, fábrica, financeiro, notas e o ERP) com o passo a passo.", texto: d.texto() };
}
