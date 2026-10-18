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
      "Contas a pagar em quadro (Kanban): botão Lista/Quadro; colunas A decidir, Falta aprovar, Programadas, Pagar hoje, Pagas (30 dias) e Não pagar, com quantidade e total. No computador, arrastar a conta para outra coluna faz a ação dela — pagar hoje, programar um dia, não pagar com motivo, voltar a decidir ou registrar o pagamento —, com as mesmas travas de aprovação e de fornecedor golpe; no celular as colunas deslizam para o lado.",
      "Painel pessoal: importar o extrato em PDF (o Itaú só entrega assim). O PDF é lido no próprio aparelho, mostra as primeiras linhas para conferir antes de gravar e não repete o que já entrou.",
      "Clientes do Tiny completos: a importação da planilha passa a trazer data de cadastro (vale como \"cliente desde\"), site, fax, e-mail da NF-e, inscrição municipal, regime tributário, limite de crédito, pessoas de contato, vendedor e endereço de cobrança, e mostra as colunas que ficaram de fora. Importar a mesma planilha de novo completa sem duplicar.",
      "Modo fiscal avançado (Analista fiscal → Deduções): baixa de estoque com motivo fiscal (quebra, defeito de fornecedor, obsolescência, furto, uso interno, manutenção da fábrica, sucata com peso, amostra) e o documento que a lei pede para a perda virar despesa dedutível; pagamentos dos extratos sem documento por tipo (Pix para pessoa, para empresa, boletos), fretes sem CT-e, prestador sem CNPJ e crédito de PIS/COFINS estimado sobre os fretes.",
      "Agendamento da coleta no envio (Fretes → envio → Execução), como no portal da Rodonaves: os próximos dias de coleta em botões (SEG 19/10…), período manhã (08h às 12h) ou tarde (13h às 18h), nº da coleta, coleta de urgência e o pedido pronto para o WhatsApp da transportadora. A frequência de coleta de cada transportadora em cada endereço da MF fica em Transportadoras → Coleta.",
      "Rodonaves pela API: \"Cotar na Rodonaves (API)\" nas cotações do envio registra o valor e o prazo; \"Testar conexão\" em Transportadoras → Rodonaves → API e internet. Usuário e senha só nos secrets do Supabase.",
      "Fluxo de pedidos com cabeçalho menor: título, busca, vendedor e NF-e automática numa linha e os canais numa faixa só.",
      "Cartão Fabiano (Início e Painel do financeiro): os débitos da conta InfinitePay SP como cartão da pessoa — gasto de hoje, da semana e do mês por categoria (alimentação, combustível, mercado, material, veículo, compras online, farmácia, Pix), as compras que ainda precisam de nota com o CNPJ da empresa, a NF-e que já chegou da SEFAZ casada pelo valor e os botões Pedi a nota, Nota ok, Sem nota (com o motivo) e Pessoal, com a regra de cada gasto no Lucro Real.",
      "Contas a pagar mais claras: painel \"Quanto tem para pagar\" com o total no centro de um anel colorido e quanto vai para transportadoras, fornecedores, folha, impostos, aluguel e contas, serviços e outros (a transportadora é reconhecida pelo CNPJ, mesmo lançada como fornecedor); vencido, próximos 7 dias, falta aprovar e não pagar; tocar num tipo mostra só as contas dele. Também no Painel do financeiro.",
      "Quadro Kanban das contas a pagar como padrão: passos numerados com cor forte (1 Falta aprovar, 2 A decidir, 3 Programadas, 4 Pagar hoje, 5 Pagas e Não pagar), cada coluna diz o que é e o que fazer, e cada conta tem a cor do tipo e o prazo em palavras.",
      "Aprovar ou não ali mesmo: botões Aprovar e Não em cada conta para quem aprova, faixa \"Sua vez de aprovar\" com Aprovar as completas (com o total por tipo antes de confirmar) e o Não pede o motivo (devolver para corrigir ou rejeitar e cancelar).",
      "Celular: os valores dos cartões dos painéis não quebram mais no meio (a letra se ajusta à largura do cartão) e os textos pequenos ficaram maiores.",
      "Notas de serviço feitas fora do ERP (Notas fiscais → NFS-e → Importar notas): as emitidas pela MF no Tiny, na prefeitura ou no Emissor Nacional e as recebidas de fornecedores (aba Recebidas), pelo XML, ZIP ou relatório do Tiny, com ISS e retenções de IR, INSS, PIS, COFINS e CSLL.",
      "CT-e automáticos da SEFAZ (Fretes e envios → CT-e): a cada 15 minutos, junto com as notas dos fornecedores, o ERP busca pela Focus os CT-e de SC e SP em que a MF aparece; vê quem paga o frete, liga a transportadora pelo CNPJ (cadastra a que falta) e a nota transportada pela chave, sem repetir o que veio pela planilha. CT-e cancelado fica fora das contas. Botão Buscar agora.",
      "Venda de Peças e Venda de Máquinas em quadro (Kanban): botão Quadro / Lista; colunas coloridas 1 Orçamentos, 2 Aprovados, 3 Faturados, 4 Entregues e Cancelados, cada uma com quantas vendas, o total, o que é e o que fazer; no celular as colunas deslizam para o lado e as abas no topo levam a cada passo. Tocar no cartão abre a venda.",
      "Conciliação: Pix recebido vira o recebimento da venda (conta recebida ligada à venda e ao cliente; a venda mostra \"Recebido\"). As 4 categorias novas do Plano de contas — combustível, veículos e pedágio, alimentação e copa, material de consumo — e as regras por favorecido deixam o extrato novo com a sugestão pronta.",
      "Importar → Tiny pela API → Buscar recebimentos do Tiny: as contas a receber já pagas no Tiny (desde 2025) entram como recebidas, ligadas à venda e ao cliente, e a conciliação acha o Pix ou depósito de cada uma — inclusive o sinal e o saldo das máquinas. Não duplica e não mexe na venda que já tem conta no ERP.",
      "CNAE das empresas (Configurações → Unidades): atividade principal e secundárias junto do CNPJ, da IE e do endereço; o botão Buscar na Receita preenche pelo CNPJ e a unidade sem CNAE já busca ao abrir. O cartão da unidade mostra o CNAE.",
      "Segurança do banco: senhas das caixas de e-mail no cofre do Supabase, chaves entre as tabelas (nada fica apontando para registro apagado), visitante sem login sem gravar em tabela nenhuma e um teste automático que confere as funções do banco a cada versão.",
      "Celular: a faixa do total no pé das listas (vendas, contas) ficou numa linha só e não cobre mais os pedidos; nos cartões de venda o nº fica numa linha, o cliente embaixo, a situação ao lado do valor e a data com o nº da NF sem cortar.",
      "Reabrir OS concluída sem querer (Assistência → abrir a OS → Reabrir OS): escolhe para onde volta (em reparo, aguardando peça…) e o motivo, que fica no histórico da OS; a cobrança em aberto é cancelada e as peças voltam ao estoque, e ao concluir de novo tudo é refeito e o cliente recebe o aviso de pronta. Não reabre com NFS-e emitida ou cobrança já recebida.",
      "Faturas para montar: os CT-e que a MF paga e ainda não estão em fatura, juntos por transportadora (e pelo nº da fatura quando vem no CT-e, com o vencimento); um toque monta a fatura e ela vai para Contas a pagar como Transportadoras, passando pela aprovação. O crédito de PIS/COFINS sobre os fretes no Analista fiscal já conta os CT-e da SEFAZ (confirmar com o contador).",
      "Configurações → Cobrança automática: a régua de cobrança (o que sai por e-mail e WhatsApp, e quando: na criação, antes, no dia e depois do vencimento, no pagamento) e o WhatsApp oficial ficam junto das outras configurações; o financeiro e as vendas também abrem. Em Financeiro → Cobrança ficam a situação dos clientes, a lista do dia para mandar pelo WhatsApp e as respostas dos clientes, com o atalho para a régua.",
      "PDV em outra aba, só com o caixa: o cartão rosa (e o PDV do menu, da busca e dos painéis) abre o PDV numa aba nova, sem botão de voltar ao ERP. Começa numa tela de entrada colorida com o relógio, a data, a hora em que o caixa abriu, as vendas de hoje, o vendedor (F9), o cliente (F8) e a busca da peça; bipar o primeiro produto abre a venda e, ao terminar, volta para a entrada.",
      "Conferência de risco antes de despachar (vendas pagas por cartão ou por link): cada pedido ganha pontos — pagamento sem baixa, primeira compra, valor alto, valor fora do padrão do cliente, CPF/CNPJ ausente ou irregular na Receita, endereço incompleto, sem contato, e-mail/telefone de outro cliente, pedidos seguidos e cartão em 6x ou mais. Do limite para cima (25 pontos), o botão Despachar trava até o financeiro aprovar dizendo o que conferiu (ou recusar); o financeiro recebe o aviso quando o pedido entra na expedição e a faixa \"Conferir o risco antes de despachar\" aparece no Fluxo de pedidos e no painel da expedição. Ajustes em Configurações → Pedidos e expedição. Vendas do Mercado Livre ficam de fora.",
      "Mercado Livre depois da venda: nova aba Vendas e notas com cada venda, a situação do envio no Mercado Livre em português (em preparação, pronto para enviar, a caminho, entregue, atrasado…), a NF-e e o rastreio. Com a conta em \"o ERP emite a NF-e\", o XML da nota autorizada vai sozinho para a venda no Mercado Livre a cada 10 minutos; no envio por conta própria, o rastreio da expedição também vai. Venda enviada ou entregue no Mercado Livre já marca o pedido e a expedição no ERP. Erro fica na lista com o motivo e o botão Tentar de novo; Mandar agora não espera os 10 minutos.",
      "Segurança: OS concluída, entregue ou cancelada não muda mais peças nem valores (só fotos e marcadores; para o resto, Reabrir OS), e ninguém marca concluída ou entregue sem os botões; item de pedido aprovado não sai para outro pedido; mensagem do contador não pode ser editada por outra pessoa (só marcar resolvida); o perfil Marketplaces mexe só no cadastro do anúncio, não em NCM e dados fiscais. E-mail: a marcação \"extrato importado\" do anexo voltou a ficar gravada.",
      "Importar → Pedidos de venda do Tiny: o quadro mostra quantos pedidos do Tiny já estão no ERP (e de que período) e, quando o Tiny recusa a API da conta, mostra o motivo e troca o botão por \"Tentar de novo\", em vez de contadores zerados.",
      "Contas a pagar como no Tiny: coluna Origem (NF de fornecedor com o número, OC, fatura de CT-e, frete, conta fixa, extrato…) e filtro por origem; período por vencimento, emissão, pagamento ou competência; busca também pelo nº da NF de entrada, da OC, do CNPJ e do histórico; Imprimir por fornecedor (com o total de cada um). Conta nova com emissão, forma de pagamento, chave Pix (vem do cadastro do fornecedor), fornecedor por busca, competência (mês do vencimento, anterior, da emissão ou escolhido) e ocorrência: única, parcelada (divide o valor), semanal, mensal, trimestral, semestral ou anual.",
      "Vendedor completo como no Tiny: nome fantasia, código, tipo de pessoa, endereço com busca pelo CEP, telefone, unidade, chave Pix (vai sozinha para a conta a pagar da comissão) e terceirizado: quem é terceirizado tem que mandar a NF — a comissão dele só é paga com o nº da NF no documento. Comissão \"50% no faturamento e o restante conforme as parcelas são pagas\" e opção de não usar as regras das linhas de produtos. Em Usuários, o acesso pode ser ligado à ficha do funcionário (documentos, endereço, banco e Pix).",
      "Vendas: o PDF da proposta e do pedido tem o nº e o nome do cliente no título e no nome do arquivo (também no e-mail da proposta); pedido com pagamento por Pix sai com o QR Code e o Pix copia e cola (valor à vista ou da 1ª parcela), também na mensagem de WhatsApp; filtro por forma de envio; botão Abrir OS no pedido aprovado, faturado ou entregue (a OS já vem com o cliente, a máquina e o nº do pedido); ocorrências do pedido com data, hora e quem escreveu, e Configurações → Pedidos decide se podem ser excluídas.",
      "Cadastros e relatórios: filtro por fornecedor nos produtos; clientes pelo telefone (com ou sem DDD, +55, fixo ou celular) e filtro por DDD; curva ABC de clientes e de produtos por período (3, 6 e 12 meses, ano atual ou anterior) com exportar para Excel; anúncios do Mercado Livre: marcar vários e pausar ou reativar de uma vez; separação de pedidos: a tela se atualiza sozinha a cada 15 segundos e toca um som quando chega pedido novo para separar (botão Som ligado/desligado).",
      "Serviços tomados como no Tiny (Notas fiscais → NFS-e → Recebidas): além do XML da nota, botão Lançar serviço tomado pela descrição, com ou sem o número da NFS-e, com os impostos retidos; cada serviço vira conta a pagar com um toque (já sem as retenções, com a NFS-e no documento e a competência), avisando quando já existe conta parecida do mesmo fornecedor para ligar em vez de duplicar. Em Contas a pagar a origem aparece como ST (serviço tomado).",
      "Mensagens entre usuários: responder um aviso (a resposta vai para quem mandou e para quem recebeu, com a conversa inteira à vista) e mandar um aviso direto para alguém pela tela de Usuários (botão do megafone).",
      "Usuários → Acessos: quem está usando o ERP agora, quantos entraram hoje, quem não entra há 30 dias e o registro de cada entrada com data e hora, até quando ficou, aparelho, navegador e endereço de internet, por pessoa e por período (hoje, 7 e 30 dias). Só o administrador vê os acessos de todos.",
      "Consertos da auditoria das telas: o Esc não apaga mais o formulário que está por baixo, botões de gravar não registram duas vezes no toque duplo, apagar e desfazer pedem confirmação, atalhos dos painéis levam à aba e ao filtro certos e quem não vê a cobrança cai direto em Contas a receber.",
      "GNRE automática como no Tiny: quando a NF-e para outro estado sai autorizada com DIFAL, FCP ou ICMS-ST, o ERP lança sozinho a conta a pagar \"GNRE – NF nº – UF\" (impostos, vence no próximo dia útil) e avisa o financeiro. Na nota aparecem os valores, a situação da guia, o atalho para o portal da GNRE e o campo para colar o código de barras, que vai para a conta. NF-e cancelada cancela a guia e a conta em aberto. Em Contas a pagar a origem aparece como GNRE. Configurações da NF-e → ICMS: ligar/desligar e os estados com inscrição de substituto (sem GNRE por nota). Regra do imposto: confirmar com o contador.",
      "Devolução de venda com o dinheiro do cliente (origem DV): na NF-e de entrada de devolução e na NF-e de devolução que o cliente emitiu aparece \"Lançar reembolso ao cliente\" — valor (pode ser parcial), data e chave Pix; vira a conta a pagar \"Devolução de venda – NF nº – cliente\" na categoria nova devoluções de vendas (dedução da receita no DRE) e passa pela aprovação. Se o cliente ainda não pagou a venda, o aviso lembra de abater a conta a receber em vez de devolver.",
      "DRE pelas notas, como no Tiny (Financeiro → DRE → Receita pelas notas): receita bruta, impostos destacados (ICMS, IPI, PIS, COFINS, DIFAL e FCP), devoluções de venda e o custo dos produtos vendidos saem das NF-e, sem as transferências entre SC e SP; as despesas continuam das contas e dos extratos, sem contar duas vezes. Botões Consolidado, SC e SP e o quadro SC × SP × consolidado do mês. Margem de contribuição, despesas fixas e ponto de equilíbrio (a receita que paga tudo) com a margem de segurança; cada categoria do Plano de contas pode ser marcada como fixa ou variável (o ERP sugere). Gerencial: a apuração oficial é do contador.",
      "DRE mais perto do Tiny: a devolução de venda estorna os impostos e o custo do que voltou; o CMV usa o custo do cadastro no dia da venda; o ISS das NFS-e entra nas deduções; IRPJ e CSLL ganham a linha Tributos sobre o lucro (categorias novas no Plano de contas); juros e descontos das baixas entram no resultado financeiro. Novos indicadores: nº de notas, ticket médio, margem bruta e o mesmo mês do ano anterior; quadros DRE × caixa e Taxas e tarifas por canal (InfinitePay, Olist, Mercado Livre, bancos).",
      "Scrum das equipes (menu Início → Scrum das equipes): ERP Line, Produção, Assistência, Vendas e Financeiro, cada uma com o seu backlog na ordem de prioridade, sprints de 1 ou 2 semanas com objetivo, quadro A fazer → Fazendo → Revisão → Feito (arrastar no computador, setas no celular), pontos de esforço, daily com o que fiz, o que vou fazer e os impedimentos, revisão e retrospectiva ao encerrar (o que não terminou volta ao backlog) e painel com burndown, velocidade e pontos por pessoa. No alto, as cinco equipes lado a lado com o ritmo da sprint. A equipe do ERP Line traz as Ideias do Sobre o ERP Line para o backlog. O administrador escolhe os membros, o dono do produto e o scrum master na aba Equipe.",
      "Boleto com Pix do Banco Inter (Contas a receber → Boleto): emite o boleto da conta com o vencimento escolhido, mostra a linha digitável e o Pix copia e cola para copiar, o PDF e o envio no WhatsApp, e cancela com o motivo. Quando o cliente paga (boleto ou Pix), o Inter avisa o ERP e a conta recebe a baixa sozinha na conta do Inter (juros e multa do atraso entram como juros recebidos). Faltando CPF/CNPJ, CEP ou endereço no cadastro do cliente, o ERP diz o que completar. Configurações → Bancos e extratos: cadastro das contas bancárias (nova conta e editar) na própria tela, Banco Inter → Ligar boletos e Regras (multa, juros, prazo para o Inter cancelar e mensagem no boleto).",
      "Extrato do Mercado Pago: as compras escritas em espanhol (\"Compra Mercado Libre\") contam em Compras em marketplaces, e o \"Débito por dívida\" (faturas e reclamações das vendas no Mercado Livre) conta como tarifa, não como compra.",
      "Bancos e conciliação: os cartões das contas ficam separados por unidade (Matriz SC e Filial SP), cada grupo com o total do saldo pelo extrato, e a conta pode ter um selo no cartão (ex.: de quem é a conta), escolhido em Editar conta bancária.",
    ],
  },
};

export type Versao = { numero: string; dia: string; titulo: string; itens: string[]; mudancas: Mudanca[] };

/** Versões da mais nova para a mais antiga. Sem histórico (prévia ou montagem sem git), só os destaques. */
export function versoesDoHistorico(historico: DiaHistorico[], destaques: Record<string, Destaque> = DESTAQUES): Versao[] {
  const dias = historico.length ? historico : Object.keys(destaques).sort().map((dia) => ({ dia, mudancas: [] as Mudanca[] }));
  return dias.map((d, i) => ({ numero: `1.${i + 1}`, dia: d.dia, titulo: destaques[d.dia]?.titulo ?? "", itens: destaques[d.dia]?.itens ?? [], mudancas: d.mudancas })).reverse();
}
