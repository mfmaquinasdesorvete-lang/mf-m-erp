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
      "Vendas como no Tiny: se já foi paga (recebida, a receber, vencida ou sem conta), forma de pagamento e de envio em ícone, rastreio, NF, foto do produto e filtro pelo pagamento.",
      "Sobre o ERP Line com indicadores, filtros e ações: Handoff (pendências por responsável, decisões e o texto pronto para passar adiante), Ideias (anotar, votar e avaliar) e Esquemas (processos em rascunho para a equipe, fluxograma do menu com auditoria e cadeia de causas com fatos e hipóteses).",
      "Menu auditado por perfil: os botões \"+\" das áreas só aparecem para quem pode lançar, o perfil Compras ganhou a barra do celular e o fluxograma do menu mostra o menu \"como\" cada perfil.",
      "Menu arrumado pela auditoria: Documentos no Início, Logística com cor própria, Gastos separados (combustível, marketplaces, impostos, tarifas e funcionários numa tela só, com abas), Painel dos clientes em Cadastros, nomes curtos sem repetir, o nome de toda área abre o painel dela e \"Sobre\" no rodapé.",
      "Cliente novo passo a passo: quem é (com a Receita e o aviso de CPF/CNPJ já cadastrado), contato, endereço, venda e revisão; no fim, pedir a assinatura da ficha, abrir uma venda ou completar o cadastro.",
    ],
  },
  "2026-10-17": {
    titulo: "Cadastros consertados, quiosques e sistemas",
    itens: [
      "Correções sugeridas no cadastro de produtos (Produtos → Qualidade): NCM, custo, categoria, marca, código de barras e tipo, achados nas notas de fornecedor, compras, fichas técnicas e na análise do cadastro; aplicar ou ignorar com um toque. NCM sem confiança alta: confirmar com o contador.",
      "Cliente desde: a data real (compra da máquina, 1ª venda, 1ª NF-e, proposta, notas da My Frost, máquina vendida ou OS), não a do cadastro no ERP.",
      "Gastos separados → Quiosques: MDF, fitas de borda, tinta e ferragens da montagem dos quiosques, pelas notas com o marcador Quiosques, mês a mês e com os pagamentos nos extratos.",
      "Telas mais enxutas: título primeiro, só o botão principal à vista e o resto em \"Mais\", 2 filtros na linha da busca e os outros no botão \"Filtros\".",
      "Vendas mais coloridas: cada situação com a sua cor na lista e nos filtros, também a situação do Tiny.",
      "Sobre → Sistemas: o sistema financeiro, o de inteligência e a vitrine de capacidades do ERP, módulo a módulo, e a linguagem de comandos (ECL) com AUDIT, IMPROVE e VISUALIZE.",
      "Painel pessoal (carteira no fim do menu, só o administrador): contas de banco, cartão e investimento separadas da empresa, saldo, para onde foi o dinheiro, próximos 30 dias e extrato OFX/CSV; fora do DRE, da conciliação e do contador.",
      "Auditoria financeira: \"Recebimento sem origem\" agora lê a origem escrita na conta (\"pedido Tiny nº…\" que existe no ERP, nota fiscal ligada) e o recebido por conta de terceiros tem a sua própria exceção.",
      "Sobre → Rodada: a rodada de trabalho de relance — etapas até o site, números ao vivo, o que foi pedido e o que virou, o que falta de quem, escopo, suposições, conflitos, semáforo e riscos.",
      "Sobre → Módulos descreve também PDV, painel das máquinas, peças, componentes, formas de pagamento e usuários.",
      "Fiscal → Parcelamentos de impostos: Receita Federal, PGFN, SEFAZ SC e SP e prefeitura, com cada parcela paga, atrasada ou a vencer, quem pagou (MF, outra empresa, conta pessoal ou contador) com o comprovante, avisos 7 e 2 dias antes, no dia e no atraso, e o risco de o parcelamento ser cancelado. Regras de cancelamento: conferir com o contador.",
      "Créditos das compras: as notas de fornecedor do histórico do Tiny (só com o XML) ganharam a lista de itens; o Analista fiscal e o Painel do contador passam a mostrar os créditos de PIS/COFINS, ICMS e IPI das entradas, sem lançar estoque nem contas.",
      "Calendário fiscal: ICMS da filial SP pelo código de recolhimento (CPR) do CNAE, com a data de cada mês como na Agenda Tributária Paulista; prazos ainda não confirmados aparecem como \"a confirmar\". Transferência SC ↔ SP com PIS/COFINS CST 49, como o contador usa.",
      "Consulta de CNPJ pelo CNPJá: no cadastro e na conferência automática de clientes e fornecedores vêm, numa consulta só, a situação na Receita, a inscrição estadual de cada estado, Simples Nacional ou MEI, a atividade principal (CNAE), o porte e a data de abertura; a ficha mostra tudo no quadro da Receita.",
      "Sobre → Monitor (só o administrador): o backup, cada automação agendada (em dia, atrasada, falhou), as respostas das funções e as filas que travam o trabalho, com o caminho para resolver. Um vigia confere tudo de hora em hora e avisa no sino; backup sem cópia guardada vira aviso urgente com ciência.",
      "Cada comando tem uma entrega clara e cada execução fica registrada em 6 etapas: entrada → diagnóstico → decisão → entrega → validação → próxima ação. Comandos novos: MONITOR (monitoramento contínuo), ANALYZE (gargalos, UX, desempenho, consistência, riscos e oportunidades) e INNOVATE (pesquisa, tendências, testes, MVP, validação, lançamento e melhoria).",
      "Sobre → Sistemas ganhou o sistema de monitoramento e automações e o motor de inovação.",
      "Monitor → Chaves e certificados: o certificado digital de cada unidade, a chave do Supabase que o GitHub usa (backup e funções), o domínio e o certificado do Banco Inter com a data de vencimento; o vigia avisa no prazo escolhido e fica urgente a 3 dias. Guarda só o nome, onde está e a data, nunca a chave.",
      "Segurança: a biblioteca de rotas das telas foi para a versão 7 (corrige um aviso de redirecionamento por link); nada muda no uso.",
      "Bancos e conciliação → Por favorecido: as linhas pendentes do extrato juntas por quem recebeu ou pagou (o posto, a loja, o fornecedor), para lançar como despesa ou receita numa categoria — ligada ao fornecedor ou cliente do cadastro — ou ignorar o grupo inteiro de uma vez. Marcando \"lembrar\", o extrato novo do mesmo favorecido já chega em \"Com sugestão\". Transferência entre as contas da empresa, sócio e empresa ligada aparecem com aviso.",
      "Painel do contador → Contabilidade: o escritório de contabilidade (telefone, site, endereço), quem procurar em cada setor — fiscal, pessoal, contábil, societário, certificado digital, financeiro e os outros —, com WhatsApp, telefone e e-mail, e a busca \"quem procurar para…\" (ex.: férias, guia de ICMS). Os e-mails que chegarem do escritório nas caixas do ERP aparecem ali com o setor de quem mandou.",
      "Fretes e envios → CT-e: os conhecimentos de transporte da transportadora (planilha do site dela, vários meses de uma vez, sem repetir) com o frete que a MF paga nas compras, nas vendas e nas transferências SC↔SP, o peso do frete sobre a nota, a entrega no prazo, mês a mês e os fornecedores onde vale negociar o frete; cada CT-e ligado à nota de compra ou de venda.",
      "Fretes e envios → Faturas de frete: junte os CT-e da fatura da transportadora, veja se o valor bate com a soma e lance a conta a pagar (categoria frete, passa pela aprovação); conferência mês a mês com o que saiu do banco para a transportadora.",
      "Clientes novos pela data real: o Painel de Cadastros não conta mais como novo quem só foi trazido do Tiny ou de planilha; vale o cadastro no Tiny, a compra da máquina, a 1ª venda ou a proposta. A tela de importação do Tiny ganhou o botão para trazer a data de cadastro de lá.",
      "Oficina não é posto: \"diesel\" no nome sozinho não marca mais posto de combustível; oficina, peças e pneus dos veículos entram em \"Manutenção de veículos\" no resumo do extrato e no DRE.",
    ],
  },
};

export type Versao = { numero: string; dia: string; titulo: string; itens: string[]; mudancas: Mudanca[] };

/** Versões da mais nova para a mais antiga. Sem histórico (prévia ou montagem sem git), só os destaques. */
export function versoesDoHistorico(historico: DiaHistorico[], destaques: Record<string, Destaque> = DESTAQUES): Versao[] {
  const dias = historico.length ? historico : Object.keys(destaques).sort().map((dia) => ({ dia, mudancas: [] as Mudanca[] }));
  return dias.map((d, i) => ({ numero: `1.${i + 1}`, dia: d.dia, titulo: destaques[d.dia]?.titulo ?? "", itens: destaques[d.dia]?.itens ?? [], mudancas: d.mudancas })).reverse();
}
