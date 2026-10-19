// Sobre → Rodada: o plano da rodada de trabalho em curso, para ver de relance — o que foi pedido e o que virou, o que
// falta de quem, o que pode ser feito já, escopo, suposições, conflitos, quando seguir ou parar e os riscos.
// Só texto aqui (o repositório é público): os números da empresa a tela lê do banco na hora.

export type SituacaoPedido = "feito" | "parcial" | "aguarda";
export type Risco = "alto" | "medio" | "baixo";

export type Rodada = {
  titulo: string;
  resumo: string;
  /** o que a empresa pediu nesta rodada e o que virou */
  pedidos: { pedido: string; virou: string; situacao: SituacaoPedido }[];
  /** respostas que faltam e o que cada uma segura */
  faltas: { pergunta: string; bloqueia: string; quem: "empresa" | "contador" }[];
  /** o que dá para fazer sem esperar nenhuma resposta */
  jaPosso: string[];
  decisoes: { grupo: string; itens: string[] }[];
  escopo: { entrou: string[]; mantido: string[]; autorizado: string[]; naoAutorizado: string[] };
  /** tela: onde conferir agora (vira o link "Conferir agora") */
  suposicoes: { texto: string; risco: Risco; seErrada: string; conferir: string; tela?: string }[];
  /** a × b: os dois pedidos que se chocam; explica: o choque em palavras simples; paraVoce: o que muda no dia a dia */
  conflitos: { a: string; b: string; escolha: string; explica?: string; paraVoce?: string; decidido?: boolean; tela?: string }[];
  semaforo: { continuar: string[]; corrigir: string[]; parar: string[] };
  riscos: { risco: string; prevencao: string }[];
};

export const RODADA_ATUAL: Rodada = {
  titulo: "Monitor, registro das execuções e motor de inovação",
  resumo: "Cada comando com entrega clara e registro em 6 etapas, o Monitor das automações com o vigia de hora em hora, a análise do ERP em 6 pontos e o motor de inovação — depois dos cadastros consertados, quiosques, parcelamentos e CNPJá.",
  pedidos: [
    { pedido: "Consertar os cadastros automático e com inteligência", virou: "Correções sugeridas em Produtos → Qualidade, para aplicar ou ignorar", situacao: "feito" },
    { pedido: "Cadastro dos clientes com a data real", virou: "Cliente desde pela compra da máquina, 1ª venda, NF-e, proposta, My Frost ou OS", situacao: "feito" },
    { pedido: "Outros menus estão grandes: padronizar", virou: "Botão principal à vista, o resto em \"Mais\"; 2 filtros na busca e o resto em \"Filtros\"", situacao: "feito" },
    { pedido: "Sobre: descrever PDV, painéis, peças, componentes, formas de pagamento e usuários", virou: "Textos novos em Sobre → Módulos, com o caminho até cada tela", situacao: "feito" },
    { pedido: "Precisa ser mais colorido, a primeira tela (a de vendas)", virou: "Vendas com selo cheio por situação, filtros e situação do Tiny coloridos", situacao: "feito" },
    { pedido: "A aba dos gastos com montagem dos quiosques", virou: "Gastos separados → Quiosques (MDF, tinta e ferragens, mês a mês e pagamentos)", situacao: "feito" },
    { pedido: "finance-os, analytics-os, ECL, AUDIT, IMPROVE, DSL", virou: "Sobre → Sistemas, módulo a módulo, com a linha de comando", situacao: "feito" },
    { pedido: "Colocar as contas pessoais junto: construir um painel para 3 a 4 contas", virou: "Painel pessoal (carteira no fim do menu): só o dono vê, fora do DRE, da conciliação e do contador", situacao: "feito" },
    { pedido: "Recebimento sem origem, mas a origem está escrita", virou: "A auditoria lê o pedido do Tiny citado e separa o recebido por conta de terceiros", situacao: "feito" },
    { pedido: "Parcelamentos de impostos: não sei o que está parcelado, em quantas vezes, e perco os prazos", virou: "Fiscal → Parcelamentos de impostos: parcelas pagas e a vencer, avisos antes do prazo e risco de cancelar", situacao: "feito" },
    { pedido: "Os impostos são pagos por outras empresas e por contas pessoais", virou: "Cada parcela guarda quem pagou (MF, outra empresa, pessoal, contador) com o comprovante, e a soma do que foi pago por fora", situacao: "feito" },
    { pedido: "Analisar as dicas fiscais (calendário, créditos, PIS/COFINS na transferência, receita)", virou: "Conferidas nos dados: duas estavam erradas (DCTFWeb no dia 15 e PIS/COFINS na transferência); o crédito zerado era a falta dos itens das notas", situacao: "feito" },
    { pedido: "Itens das notas de compra no ERP, CST 49 na transferência, ISS dia 10 e ICMS SP por mês", virou: "Itens das 1.075 notas preenchidos, CST trocado, calendário com o CPR de SP e prazos a confirmar", situacao: "feito" },
    { pedido: "capability-showcase com as capacidades do ERP", virou: "Vitrine de capacidades em Sobre → Sistemas", situacao: "feito" },
    { pedido: "Colocar o plano da rodada numa página do Sobre, tipo VISUALIZE", virou: "Sobre → Rodada e o comando VISUALIZE no ECL", situacao: "feito" },
    { pedido: "Pode publicar", virou: "Rodada publicada no site", situacao: "feito" },
    { pedido: "Entregas claras para cada comando; cada execução registra entrada → diagnóstico → decisão → entrega → validação → próxima ação", virou: "Cada comando do ECL mostra a sua entrega e o administrador registra a execução nas 6 etapas (Sobre → Monitor → Registro)", situacao: "feito" },
    { pedido: "Monitoramento contínuo e automações", virou: "Sobre → Monitor (automações, respostas das funções, filas e backup) e o vigia de hora em hora com aviso no sino; o backup parado já virou aviso urgente", situacao: "feito" },
    { pedido: "Motor de inovação: pesquisa, tendências, testes, MVP, validação, lançamento, melhoria", virou: "Comando INNOVATE e o sistema innovation-os em Sobre → Sistemas, etapa por etapa, com onde cada uma está no ERP", situacao: "feito" },
    { pedido: "Analisa um sistema existente: gargalos, UX, desempenho, consistência, riscos, oportunidades", virou: "Comando ANALYZE com os 6 pontos e a análise do ERP inteiro feita com números reais, registrada no Monitor", situacao: "feito" },
    { pedido: "Aprovo: conciliação do extrato em lote", virou: "Bancos e conciliação → Por favorecido: lançar ou ignorar o grupo inteiro e lembrar a regra para o extrato novo", situacao: "feito" },
    { pedido: "Aprovo: aviso antes de vencer chaves e certificados", virou: "Monitor → Chaves e certificados, com o aviso do vigia no prazo de cada um", situacao: "feito" },
    { pedido: "Como faço? Colocar os 2 secrets no GitHub e rodar o backup", virou: "Secrets trocados e 1ª cópia guardada: 143 tabelas, 112 arquivos e o teste de restauração ok", situacao: "feito" },
    { pedido: "Contatos com a contabilidade e dados (lista do escritório)", virou: "Painel do contador → Contabilidade: 35 contatos por setor, dados do escritório e os e-mails que chegarem de lá", situacao: "feito" },
    { pedido: "Pode publicar (17/10)", virou: "Site publicado com a conciliação por favorecido, Chaves e certificados e as rotas novas", situacao: "feito" },
    { pedido: "Aprovo: atualizar as bibliotecas xlsx e react-router", virou: "Rotas na versão 7 (feito); a planilha (xlsx) espera liberar o endereço cdn.sheetjs.com na rede do ambiente do Claude", situacao: "parcial" },
  ],
  faltas: [
    { pergunta: "Conectar a caixa de e-mail do contador no ERP (Configurações → Caixa de e-mail, com a senha de app do Google)", bloqueia: "Guias, recibos e documentos do contador entrarem sozinhos no ERP", quem: "empresa" },
    { pergunta: "Cadastrar em Monitor → Chaves e certificados a data da chave nova do Supabase e dos certificados A1", bloqueia: "O aviso antes de vencer (a última chave venceu e o backup parou)", quem: "empresa" },
    { pergunta: "Liberar cdn.sheetjs.com na rede do ambiente do Claude", bloqueia: "Atualizar a biblioteca das planilhas (xlsx), que tem aviso de segurança", quem: "empresa" },
    { pergunta: "Relatório de todos os parcelamentos (federal, PGFN, SEFAZ SC e SP, prefeitura) com nº, parcelas e vencimentos", bloqueia: "Cadastrar os parcelamentos e os alertas de prazo", quem: "contador" },
    { pergunta: "Como lançar o imposto da MF pago por outra empresa ou por conta pessoal (mútuo, adiantamento, aporte)?", bloqueia: "A contabilidade dessas parcelas", quem: "contador" },
    { pergunta: "Os créditos das compras de 2025 e 2026 foram aproveitados na EFD? (planilha enviada)", bloqueia: "Recuperar créditos não aproveitados dentro de 5 anos", quem: "contador" },
    { pergunta: "CPR do ICMS da filial SP no CADESP (CNAE 2829-1/99) e dia do ISS de São José", bloqueia: "Tirar o \"a confirmar\" do calendário", quem: "contador" },
    { pergunta: "Cadastrar as 3 ou 4 contas pessoais no painel (sem senha, só o nome e o saldo)", bloqueia: "Saldos, entradas e saídas do painel Pessoal", quem: "empresa" },
    { pergunta: "O ECL só leva até a tela e registra, ou também executa a ação sozinho?", bloqueia: "Comandos que fazem sozinhos (hoje: levam à tela e registram as 6 etapas)", quem: "empresa" },
    { pergunta: "NCM das peças: confirmar as sugestões de confiança média e baixa", bloqueia: "Aplicar esses NCM nos produtos", quem: "contador" },
  ],
  jaPosso: [
    "Revisar, tela a tela, quais 2 filtros ficam à vista na linha da busca",
    "Conferir Notas fiscais e Necessidades de compra com o novo menu \"Mais\"",
    "Deixar os textos iguais ao nome novo da aba (\"Qualidade\")",
    "Seguir a fila: período em todas as listas, giro do estoque e Ficha 360 colorida",
    "Deixar o pacote do site montado, sem publicar",
  ],
  decisoes: [
    { grupo: "Quiosques", itens: ["Notas de MDF e tinta marcadas com o marcador Quiosques (aprovado)", "Depósitos do licenciamento da InfinitePay SP como recebido por terceiros, até o contador decidir"] },
    { grupo: "Telas", itens: ["Gastos separados numa tela só, com abas; os endereços antigos continuam abrindo a aba certa", "Cadastro de produto pede o motivo nas mudanças sensíveis: a correção grava \"Correção sugerida (fonte)\""] },
    { grupo: "Regras de trabalho", itens: ["Banco só ganha coisas (nada é apagado)", "Dado da empresa fica fora do código (repositório público)", "Nada muda nos dados sem confirmar", "Perguntar \"pode publicar?\" antes de publicar", "Fiscal: só o legal, com \"confirmar com o contador\""] },
    { grupo: "Princípios", itens: ["Venda é diferente de nota fiscal", "MF é diferente de My Frost", "Fora do escopo: comparar proposta com NF e cadastro de venda sem NF"] },
  ],
  escopo: {
    entrou: ["Correções sugeridas dos produtos", "Cliente desde", "Aba Quiosques", "Menu \"Mais\" e filtros enxutos", "Vendas coloridas", "Sobre → Sistemas e ECL", "Textos do Sobre e das Atualizações", "Migrações 91 e 92 anotadas"],
    mantido: ["Todos os dados", "Permissões e travas do banco", "Validações do cadastro de produtos", "Filtros no celular", "Modo demonstração", "Endereços antigos de Gastos", "Telas sem cor própria continuam iguais"],
    autorizado: ["Mudanças de tela pedidas", "Banco só com acréscimos (já aplicados)", "Carga das sugestões sem mexer nos produtos", "Publicar esta rodada (aprovado)", "Construir o painel Pessoal separado"],
    naoAutorizado: ["Publicar o painel Pessoal sem nova aprovação", "Aplicar sugestões nos produtos", "Mudar qualquer dado", "Misturar as contas pessoais com as da empresa", "Apagar algo no banco", "Publicar funções no Supabase"],
  },
  suposicoes: [
    { texto: "O favorecido é o nome antes do \" · \" ou depois de \"Transferência … - \" na descrição do banco, sem números (loja 01 e loja 02 juntas)", risco: "medio", seErrada: "Dois favorecidos diferentes no mesmo grupo", conferir: "Abrir as linhas do grupo (seta) antes de lançar" },
    { texto: "Linha com conta ou transferência sugerida fica fora do lote", risco: "baixo", seErrada: "Grupo menor que o esperado", conferir: "Aprovar antes em \"Com sugestão\"" },
    { texto: "As notas com o marcador Quiosques são todas de quiosque", risco: "alto", seErrada: "O total da aba fica errado", conferir: "O financeiro passa os olhos na lista da aba e tira o marcador da nota que não for de quiosque", tela: "/licenciados?aba=quiosques" },
    { texto: "Ferragens, cola, frete e impostos dessas notas também são custo do quiosque", risco: "medio", seErrada: "Total maior que o real", conferir: "A aba mostra cada grupo separado: confirmar", tela: "/licenciados?aba=quiosques" },
    { texto: "O pagamento no extrato é achado pelas duas primeiras palavras do nome da loja", risco: "medio", seErrada: "Pagamento faltando ou de outra obra", conferir: "Revisar os \"sem nota ligada\" depois de publicar" },
    { texto: "O evento mais antigo é o \"cliente desde\"", risco: "medio", seErrada: "Data errada onde a importação veio errada", conferir: "Conferir 10 clientes com o Tiny", tela: "/clientes" },
    { texto: "Pôr Exportar e Importar no \"Mais\" também no computador é a padronização pedida", risco: "baixo", seErrada: "Alguém não acha o Exportar", conferir: "Opinião de quem usa; volta fácil" },
    { texto: "Os 2 primeiros filtros de cada tela são os mais usados", risco: "medio", seErrada: "Um filtro importante fica escondido", conferir: "Revisão tela a tela (já posso fazer)" },
    { texto: "O ECL leva até a tela e registra a execução; quem executa é a pessoa (ou o vigia, no MONITOR)", risco: "baixo", seErrada: "Esperava que ele executasse sozinho", conferir: "Pergunta pendente" },
    { texto: "Avisar só o administrador pelo vigia (não o financeiro)", risco: "medio", seErrada: "O financeiro não fica sabendo do que parou", conferir: "Dizer quem mais deve receber os avisos" },
    { texto: "Atrasada = passou de 2 vezes o intervalo sem rodar", risco: "baixo", seErrada: "Alarme cedo ou tarde demais", conferir: "Olhar o Monitor por uma semana" },
    { texto: "A situação \"tem / em parte / falta\" de cada módulo está certa", risco: "baixo", seErrada: "A página Sistemas engana", conferir: "Revisão da página" },
    { texto: "O tema escuro é o principal", risco: "baixo", seErrada: "Cores ruins no tema claro", conferir: "Trocar o tema no ERP e olhar" },
    { texto: "\"Contas pessoais\" são contas de banco, cartão ou investimento com entradas e saídas", risco: "medio", seErrada: "O painel não serve para o que você quer", conferir: "Você usa o painel e diz o que falta" },
  ],
  conflitos: [
    { a: "Mais colorido", b: "Menus menores", decidido: true,
      explica: "Você pediu telas mais coloridas e, ao mesmo tempo, menus e botões que ocupem menos espaço. Cor em tudo deixaria as telas pesadas e confusas.",
      escolha: "A cor foi para a informação (selos de situação, filtros e números) e as ações pouco usadas foram para o botão \"Mais\".",
      paraVoce: "Você vê a situação pela cor num olhar; o que se usa pouco está no \"Mais\" de cada tela." },
    { a: "Consertar sozinho", b: "Não mudar dados sem confirmar e o risco fiscal do NCM", decidido: true, tela: "/estoque?aba=qualidade",
      explica: "Você pediu que o ERP consertasse os cadastros sozinho, mas também que nada mude sem o seu ok. E um NCM errado muda o imposto de todas as notas daquele produto.",
      escolha: "O ERP sugere a correção, com o grau de certeza, e uma pessoa aplica; NCM com pouca certeza vai para o contador conferir.",
      paraVoce: "As sugestões ficam em Produtos → Qualidade: você aplica ou ignora, uma a uma ou em lote." },
    { a: "Contas pessoais junto", b: "Lucro Real, DRE e contador", decidido: true,
      explica: "Ver as contas pessoais dentro do ERP ajuda no dia a dia, mas misturar com as da empresa bagunça o DRE, a conciliação e o que vai para o contador (Lucro Real).",
      escolha: "Painel pessoal à parte: só você vê, fora do DRE, da conciliação e do contador.",
      paraVoce: "Pela carteira no fim do menu. Nada dele aparece para a equipe nem para o contador." },
    { a: "Código público", b: "Dados da empresa", decidido: true,
      explica: "O código do ERP fica num repositório público no GitHub. Números, nomes e dados da empresa não podem ir para lá.",
      escolha: "Os dados ficam só no banco do ERP e as telas leem do banco na hora; no código vão só textos genéricos.",
      paraVoce: "Ninguém de fora vê os dados da MF olhando o código." },
    { a: "Banco só com acréscimos", b: "Mudar funções", decidido: true,
      explica: "Para nunca perder nada, o combinado é só acrescentar no banco, sem apagar. Mas às vezes uma regra do banco (uma função) precisa mudar.",
      escolha: "A função é trocada pela versão nova sem apagar nenhuma tabela nem dado, e testada antes numa transação desfeita.",
      paraVoce: "As melhorias entram sem risco de sumir informação." },
    { a: "Separar o gasto dos quiosques", b: "DRE", decidido: true, tela: "/licenciados?aba=quiosques",
      explica: "Você quis ver o gasto com os quiosques (MDF, tinta, ferragens) separado, mas mudar a classificação contábil mexe no DRE e no que o contador recebe.",
      escolha: "A aba Quiosques só mostra os gastos separados: a classificação no DRE não muda e o licenciamento segue com o contador.",
      paraVoce: "Você enxerga quanto foi para os quiosques sem mexer na contabilidade." },
    { a: "Abas curtas", b: "Textos que citam \"Qualidade do cadastro\"", decidido: true,
      explica: "Os nomes das abas ficaram mais curtos (ex.: \"Qualidade\"), mas alguns textos ainda falavam o nome antigo.",
      escolha: "Os textos foram ajustados para o nome novo.",
      paraVoce: "Ninguém procura uma aba com um nome que não existe mais." },
  ],
  semaforo: {
    continuar: ["Verificação de tipos e testes passando; build sem erro", "Telas sem erro na demonstração, no computador e no celular", "Nada saindo da tela", "\"Pode publicar\" dado"],
    corrigir: ["Algo saindo da tela ou filtro necessário escondido", "Números dos quiosques que não batem com as notas", "Muitas sugestões \"puladas\" ao aplicar", "Alguém disser que piorou"],
    parar: ["Passo que apague algo no banco", "Necessidade de senha ou token", "Mudança fiscal sem o contador", "Contas pessoais misturadas com as da empresa", "Falha na conferência depois de publicar (volta a versão anterior)"],
  },
  riscos: [
    { risco: "O site quebrar depois de publicar", prevencao: "Os arquivos das 2 versões anteriores vão junto e os arquivos publicados são conferidos" },
    { risco: "NCM errado aplicado em lote", prevencao: "Confiança em cada sugestão, contagem de NCM na confirmação, histórico com o motivo e contador antes" },
    { risco: "Sugestões repetidas ou velhas na procura diária", prevencao: "O banco não deixa repetir e as já corrigidas vencem sozinhas; olhar a contagem toda semana" },
    { risco: "Pagamento de outra loja nos quiosques", prevencao: "Nome completo da loja, testes e o aviso \"sem nota ligada\"" },
    { risco: "Menu \"Mais\" fora do lugar", prevencao: "Posição calculada para ficar dentro da tela; não usar dentro de janelas sobrepostas" },
    { risco: "Demonstração diferente do real", prevencao: "Depois de publicar, testar as mesmas telas com os dados reais" },
    { risco: "Mensagem cortada ou nome sem definição", prevencao: "Nada é construído antes de confirmar" },
    { risco: "Aviso demais e ninguém lê (o backup ficou 6 dias com aviso comum)", prevencao: "O mesmo aviso não se repete por 20 horas; só o backup é urgente e pede ciência" },
    { risco: "Histórico do agendador crescendo sem fim", prevencao: "Contador de linhas no Monitor; limpeza (guardar 14 dias) pelo SQL Editor quando aprovar" },
  ],
};
