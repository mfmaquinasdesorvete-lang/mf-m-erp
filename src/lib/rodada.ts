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
  suposicoes: { texto: string; risco: Risco; seErrada: string; conferir: string }[];
  conflitos: { a: string; b: string; escolha: string }[];
  semaforo: { continuar: string[]; corrigir: string[]; parar: string[] };
  riscos: { risco: string; prevencao: string }[];
};

export const RODADA_ATUAL: Rodada = {
  titulo: "Cadastros consertados, quiosques e sistemas",
  resumo: "Correções sugeridas nos produtos, cliente desde com a data real, aba Quiosques, telas enxutas, vendas coloridas e a página Sistemas com a linguagem de comandos (ECL).",
  pedidos: [
    { pedido: "Consertar os cadastros automático e com inteligência", virou: "Correções sugeridas em Produtos → Qualidade, para aplicar ou ignorar", situacao: "feito" },
    { pedido: "Cadastro dos clientes com a data real", virou: "Cliente desde pela compra da máquina, 1ª venda, NF-e, proposta, My Frost ou OS", situacao: "feito" },
    { pedido: "Outros menus estão grandes: padronizar", virou: "Botão principal à vista, o resto em \"Mais\"; 2 filtros na busca e o resto em \"Filtros\"", situacao: "feito" },
    { pedido: "Sobre: descrever PDV, painéis, peças, componentes, formas de pagamento e usuários", virou: "Textos novos em Sobre → Módulos, com o caminho até cada tela", situacao: "feito" },
    { pedido: "Precisa ser mais colorido, a primeira tela (a de vendas)", virou: "Vendas com selo cheio por situação, filtros e situação do Tiny coloridos", situacao: "feito" },
    { pedido: "A aba dos gastos com montagem dos quiosques", virou: "Gastos separados → Quiosques (MDF, tinta e ferragens, mês a mês e pagamentos)", situacao: "feito" },
    { pedido: "finance-os, analytics-os, ECL, AUDIT, IMPROVE, DSL", virou: "Sobre → Sistemas, módulo a módulo, com a linha de comando", situacao: "feito" },
    { pedido: "Colocar as contas pessoais junto: construir um painel para 3 a 4 contas", virou: "Painel Pessoal separado da empresa: só o dono vê, fora do DRE e do contador", situacao: "parcial" },
    { pedido: "capability-showcase com as capacidades do ERP", virou: "Vitrine de capacidades em Sobre → Sistemas", situacao: "feito" },
    { pedido: "Colocar o plano da rodada numa página do Sobre, tipo VISUALIZE", virou: "Sobre → Rodada e o comando VISUALIZE no ECL", situacao: "feito" },
    { pedido: "Pode publicar", virou: "Rodada publicada no site", situacao: "feito" },
  ],
  faltas: [
    { pergunta: "Pode publicar o painel Pessoal quando ficar pronto?", bloqueia: "O painel Pessoal no site", quem: "empresa" },
    { pergunta: "Cadastrar as 3 ou 4 contas pessoais no painel (sem senha, só o nome e o saldo)", bloqueia: "Saldos, entradas e saídas do painel Pessoal", quem: "empresa" },
    { pergunta: "O ECL só leva até a tela ou também executa a ação?", bloqueia: "Comandos que fazem sozinhos e verbos novos", quem: "empresa" },
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
    { texto: "As notas com o marcador Quiosques são todas de quiosque", risco: "alto", seErrada: "O total da aba fica errado", conferir: "O financeiro passa os olhos na lista da aba" },
    { texto: "Ferragens, cola, frete e impostos dessas notas também são custo do quiosque", risco: "medio", seErrada: "Total maior que o real", conferir: "A aba mostra cada grupo separado: confirmar" },
    { texto: "O pagamento no extrato é achado pelas duas primeiras palavras do nome da loja", risco: "medio", seErrada: "Pagamento faltando ou de outra obra", conferir: "Revisar os \"sem nota ligada\" depois de publicar" },
    { texto: "O evento mais antigo é o \"cliente desde\"", risco: "medio", seErrada: "Data errada onde a importação veio errada", conferir: "Conferir 10 clientes com o Tiny" },
    { texto: "Pôr Exportar e Importar no \"Mais\" também no computador é a padronização pedida", risco: "baixo", seErrada: "Alguém não acha o Exportar", conferir: "Opinião de quem usa; volta fácil" },
    { texto: "Os 2 primeiros filtros de cada tela são os mais usados", risco: "medio", seErrada: "Um filtro importante fica escondido", conferir: "Revisão tela a tela (já posso fazer)" },
    { texto: "O ECL só leva até a tela", risco: "baixo", seErrada: "Esperava que ele executasse", conferir: "Pergunta pendente" },
    { texto: "A situação \"tem / em parte / falta\" de cada módulo está certa", risco: "baixo", seErrada: "A página Sistemas engana", conferir: "Revisão da página" },
    { texto: "O tema escuro é o principal", risco: "baixo", seErrada: "Cores ruins no tema claro", conferir: "Trocar o tema no ERP e olhar" },
    { texto: "\"Contas pessoais\" são contas de banco, cartão ou investimento com entradas e saídas", risco: "medio", seErrada: "O painel não serve para o que você quer", conferir: "Você usa o painel e diz o que falta" },
  ],
  conflitos: [
    { a: "Mais colorido", b: "Menus menores", escolha: "A cor vai para a informação (selos e filtros); o tamanho sai das ações (\"Mais\")" },
    { a: "Consertar sozinho", b: "Não mudar dados sem confirmar e o risco fiscal do NCM", escolha: "O ERP só sugere e uma pessoa aplica; NCM sem confiança alta pede o contador" },
    { a: "Contas pessoais junto", b: "Lucro Real, DRE e contador", escolha: "Painel Pessoal à parte: só o dono vê, fora do DRE, da conciliação e do contador (decidido)" },
    { a: "Código público", b: "Dados da empresa", escolha: "Sugestões carregadas direto no banco, fora do código; esta página lê os números do banco" },
    { a: "Banco só com acréscimos", b: "Mudar funções", escolha: "Funções e views são substituídas sem apagar nada" },
    { a: "Separar o gasto dos quiosques", b: "DRE", escolha: "A aba só mostra: a classificação do DRE não muda e o licenciamento segue com o contador" },
    { a: "Abas curtas", b: "Textos que citam \"Qualidade do cadastro\"", escolha: "Alinhar os textos ao nome novo" },
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
  ],
};
