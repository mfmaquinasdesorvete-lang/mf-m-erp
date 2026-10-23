// docs/glossario.md: os termos e siglas que aparecem no ERP, em palavras simples. A definição fica aqui; o
// "Aparece em" sai dos textos das telas (modulos.ts e modulosDetalhe.ts). Termo que não aparece em nenhuma tela
// fica de fora (o gerador avisa), para o glossário só ter o que o ERP usa.
import { AREAS, DETALHE_TELAS, SOBRE_TELAS, documento } from "./base.mjs";

/** termo → definição. busca: outras formas de achar o termo nos textos (a primeira é o próprio termo). */
const TERMOS = [
  { t: "Baixa", d: "Marcar uma conta como paga (conta a pagar) ou recebida (conta a receber). No estoque, é a saída do produto: \"o estoque baixa\" quando a venda é aprovada.", busca: ["baixa", "baixada", "baixar a conta"] },
  { t: "Backlog", d: "A lista de tarefas de uma equipe, na ordem de prioridade. Usada no Scrum." },
  { t: "Boleto", d: "Documento de cobrança pago no banco, no aplicativo ou na lotérica, com vencimento." },
  { t: "Carta de correção", d: "Corrige um erro simples de uma NF-e já autorizada (endereço, peso, observação), sem cancelar a nota. Não serve para mudar valor, quantidade ou cliente." },
  { t: "CFOP", d: "Código de 4 números na nota fiscal que diz o tipo de operação: venda, compra, devolução, transferência, conserto… e se é dentro ou fora do estado." },
  { t: "Comissão", d: "A parte da venda que vai para o vendedor ou o representante, calculada pela regra de cada um." },
  { t: "Conciliação", d: "Ligar cada linha do extrato do banco à conta lançada no ERP. Quando tudo está conciliado, o saldo do ERP é igual ao do banco.", busca: ["conciliação", "conciliar", "conciliado", "conciliada"] },
  { t: "Conta master", d: "A conta principal da empresa no ERP. Entre os administradores, só ela abre os usuários e as configurações da empresa.", busca: ["conta master"] },
  { t: "Cotação", d: "Pedido de preço a um ou mais fornecedores (ou transportadoras) antes de comprar, para comparar e escolher." },
  { t: "CST", d: "Código em cada item da nota que diz como o imposto é tratado: tributado, isento, com redução, com substituição…" },
  { t: "CT-e", d: "Conhecimento de Transporte eletrônico: a nota fiscal do frete, emitida pela transportadora." },
  { t: "Curva ABC", d: "Divide produtos ou clientes em três grupos: A são os poucos que trazem a maior parte do faturamento, B os do meio e C os muitos que vendem pouco." },
  { t: "DANFE", d: "A folha impressa que acompanha a mercadoria e mostra os dados da NF-e. A nota que vale é o arquivo XML; o DANFE é a versão em papel." },
  { t: "DIFAL", d: "Diferença de ICMS entre dois estados, paga na venda para um consumidor final de outro estado." },
  { t: "DRE", d: "Demonstração do Resultado: as receitas menos os custos e as despesas. Mostra se a empresa teve lucro ou prejuízo no período." },
  { t: "EAN", d: "O número do código de barras do produto, usado no leitor e nos marketplaces." },
  { t: "Extrato", d: "A lista do que entrou e saiu de uma conta do banco. O ERP recebe o extrato por arquivo, por e-mail ou direto do banco." },
  { t: "Ficha técnica", d: "A lista das peças, das quantidades e das etapas para montar uma máquina. A ordem de produção usa a ficha técnica." },
  { t: "Fluxo de caixa", d: "O dinheiro que entra e que sai, dia a dia, e o saldo que fica. O fluxo previsto mostra o que vem pela frente." },
  { t: "Garantia", d: "O prazo em que o conserto da máquina vendida é por conta da empresa. Começa na venda e depende do modelo." },
  { t: "GNRE", d: "Guia para pagar o ICMS devido a outro estado (como o DIFAL), quando a nota vai para fora." },
  { t: "IBS e CBS", d: "Os impostos novos da reforma tributária, que vão substituir aos poucos PIS, COFINS, ICMS e ISS.", busca: ["IBS", "CBS"] },
  { t: "ICMS", d: "Imposto estadual sobre a venda e o transporte de mercadorias. Cada estado tem as suas regras." },
  { t: "Inadimplência", d: "Contas a receber vencidas e ainda não pagas; inadimplente é o cliente que está devendo.", busca: ["inadimplência", "inadimplentes", "inadimplente"] },
  { t: "IPI", d: "Imposto federal sobre produtos industrializados, como as máquinas fabricadas." },
  { t: "Kanban", d: "Quadro em colunas (etapas) em que cada cartão anda de uma coluna para a outra até terminar." },
  { t: "Kit", d: "Um produto formado por outros produtos, vendido junto. Ao vender o kit, o estoque de cada item baixa.", busca: ["kit", "kits"] },
  { t: "Lucro Real", d: "Regime de imposto da empresa em que o IRPJ e a CSLL são calculados sobre o lucro de verdade, com obrigações mensais." },
  { t: "Marcador", d: "Etiqueta colorida para organizar cadastros, vendas, OS e contas. Marcadores só somam: importações e correções não tiram os que já existem.", busca: ["marcador", "marcadores"] },
  { t: "Margem de contribuição", d: "Quanto sobra de cada venda depois de tirar o custo do produto, os impostos, a comissão, o frete e as taxas.", busca: ["margem de contribuição", "margem"] },
  { t: "Matriz e filial", d: "A matriz é a unidade principal da empresa (SC) e a filial é a outra unidade (SP). Cada uma tem o seu estoque.", busca: ["matriz", "filial"] },
  { t: "NCM", d: "Código de 8 números que classifica o produto. É dele que saem as regras de imposto do item." },
  { t: "NF-e", d: "Nota fiscal eletrônica de produtos: a nota da venda, da compra, da devolução ou da transferência." },
  { t: "NFS-e", d: "Nota fiscal eletrônica de serviço, emitida pela prefeitura. Usada no conserto e na mão de obra da assistência." },
  { t: "OC", d: "Ordem de compra: o pedido feito ao fornecedor, com itens, preço, prazo e pagamento.", busca: ["OC", "ordem de compra"] },
  { t: "OFX", d: "O arquivo de extrato que o banco gera e o ERP importa." },
  { t: "Open Finance", d: "Forma autorizada de o banco mandar o extrato para o ERP sozinho, sem baixar arquivo." },
  { t: "OP", d: "Ordem de produção: o pedido para a fábrica montar uma ou mais máquinas, com as peças e as etapas.", busca: ["OP", "OPs", "ordem de produção"] },
  { t: "OS", d: "Ordem de serviço: o registro de um conserto ou atendimento da assistência, da entrada da máquina até a entrega.", busca: ["OS", "ordem de serviço", "ordens de serviço"] },
  { t: "PDV", d: "Ponto de venda: o caixa da venda de balcão, numa tela própria, com leitor de código de barras." },
  { t: "Perfil", d: "O tipo de acesso de cada pessoa no ERP (vendas, financeiro, técnico…). O perfil decide as telas que ela abre e o que pode fazer.", busca: ["perfil", "perfis", "papel principal"] },
  { t: "PIS e COFINS", d: "Contribuições federais sobre o faturamento. No Lucro Real, as compras geram crédito que abate o que se paga.", busca: ["PIS", "COFINS"] },
  { t: "Pix", d: "Pagamento instantâneo pelo banco, a qualquer hora, por chave, QR Code ou copia e cola." },
  { t: "Preventiva", d: "Manutenção feita antes de a máquina quebrar, no prazo indicado para o modelo. O ERP lembra quando está perto.", busca: ["preventiva", "preventivas"] },
  { t: "Proposta comercial", d: "O orçamento bonito que vai para o cliente por link, com fotos, garantia e condições, para ele aprovar ou recusar.", busca: ["proposta", "propostas"] },
  { t: "Régua de cobrança", d: "Lembretes automáticos ao cliente antes e depois do vencimento de uma conta." },
  { t: "Representante", d: "Vendedor externo que não entra no ERP: usa um portal próprio, com os pedidos, os clientes e as comissões dele.", busca: ["representante", "representantes"] },
  { t: "SEFAZ", d: "Secretaria da Fazenda do estado: é quem autoriza as notas fiscais eletrônicas." },
  { t: "Sprint", d: "Um período curto (1 ou 2 semanas) em que a equipe se compromete a terminar um conjunto de tarefas. Usado no Scrum.", busca: ["sprint", "sprints"] },
  { t: "Tabela de preço", d: "Uma lista de preços para um tipo de cliente ou canal (balcão, revenda, marketplace…).", busca: ["tabela de preço", "tabelas de preço"] },
  { t: "Teste do giga", d: "O teste elétrico de cada máquina na bancada (registro de qualidade REG-006), feito antes de ela sair da fábrica.", busca: ["giga"] },
  { t: "Ticket médio", d: "O valor médio de cada venda: o total vendido dividido pelo número de vendas." },
  { t: "XML", d: "O arquivo da nota fiscal eletrônica. É ele que vale para o fisco e é o que o contador recebe." },
];

const semAcento = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
/** Acha a palavra inteira; sigla em maiúsculas só casa em maiúsculas (OS não é "os"). */
function casa(texto, forma) {
  const sigla = forma === forma.toUpperCase() && /\p{Lu}/u.test(forma);
  const esc = semAcento(forma).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}-])${esc}(?![\\p{L}\\p{N}-])`, sigla ? "u" : "iu").test(semAcento(texto));
}

export function gerarGlossario({ ancoras }) {
  const d = documento();
  const telas = AREAS.flatMap((a) => a.itens).filter((i) => ancoras[i.to]);
  const texto = (to) => [SOBRE_TELAS[to] ?? "", DETALHE_TELAS[to]?.destaque ?? "", ...(DETALHE_TELAS[to]?.partes ?? [])].join(" \n ");
  const termos = [];
  for (const x of TERMOS) {
    const formas = x.busca ?? [x.t];
    const onde = telas.filter((i) => formas.some((f) => casa(texto(i.to), f)));
    if (!onde.length) { console.warn(`glossário: "${x.t}" não aparece em nenhuma tela; ficou de fora`); continue; }
    termos.push({ ...x, onde });
  }
  termos.sort((a, b) => semAcento(a.t).localeCompare(semAcento(b.t), "pt-BR"));
  const letras = [...new Set(termos.map((x) => semAcento(x.t)[0].toUpperCase()))];
  const ancLetra = Object.fromEntries(letras.map((l) => [l, d.ancora(l)]));

  d.cabecalho("Glossário do ERP Line", "as definições ficam em scripts/docs/glossario.mjs; o \"Aparece em\" sai de src/lib/modulos.ts e src/lib/modulosDetalhe.ts",
    `**${termos.length} termos**`,
    "As siglas e palavras que aparecem no ERP, explicadas em palavras simples. Em cada termo, \"Aparece em\" mostra as telas que usam a palavra "
    + "(toque para ver a tela no documento [Módulos do ERP Line](modulos.md)).");

  d.push("## Índice", "", letras.map((l) => `[${l}](#${ancLetra[l]})`).join(" · "), "");
  const MAX = 6;
  for (const l of letras) {
    d.push(`## ${l}`, "");
    for (const x of termos.filter((y) => semAcento(y.t)[0].toUpperCase() === l)) {
      const links = x.onde.slice(0, MAX).map((i) => `[${i.label}](modulos.md#${ancoras[i.to]})`).join(" · ");
      const mais = x.onde.length > MAX ? ` e mais ${x.onde.length - MAX}` : "";
      d.push(`### ${x.t}`, "", x.d, "", `_Aparece em: ${links}${mais}._`, "");
    }
  }
  return { arquivo: "glossario.md", titulo: "Glossário do ERP Line", sobre: "As siglas e palavras do ERP (OS, OP, NF-e, CFOP, conciliação, preventiva…) em palavras simples, com as telas onde aparecem.", texto: d.texto() };
}
