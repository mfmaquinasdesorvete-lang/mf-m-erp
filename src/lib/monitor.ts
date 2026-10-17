// Sobre → Monitor: a saúde do ERP de relance. As automações agendadas (pg_cron) com a situação de cada uma pela agenda
// (rodou na hora? falhou?), as respostas das funções, as filas que travam o trabalho e o backup. Os números vêm de
// saude_sistema() na hora; aqui ficam só as regras (para testar) e os nomes em português.
// E o registro das execuções: todo comando (AUDIT, MONITOR, ANALYZE, INNOVATE…) anota as 6 etapas, na mesma ordem.

export type Automacao = {
  nome: string; agenda: string; ativo: boolean; ultima: string | null; ultima_situacao: string | null; ultima_seg: number | null;
  rodadas_24h: number; falhas_24h: number; falhas_7d: number; ultimo_erro: string | null; ultimo_erro_em: string | null;
};
export type Fila = { chave: string; qtd: number; total?: number; desde: string | null };
export type Backup = {
  ultimo_ok: string | null; falhas_seguidas: number;
  ultimo: { em: string; status: string; detalhe: string | null; hostinger_em: string | null } | null;
};
export type Chamadas = { ok: number; erro: number; tempo_esgotado: number; desde: string | null; ultimo_erro: string | null };
/** Chave ou certificado com data para vencer: o nome, onde está e a data — nunca a chave em si. */
export type Vencimento = {
  id: string; origem: "cadastro" | "inter"; nome: string; tipo: TipoChave; onde: string | null; vence_em: string;
  avisar_dias: number; como_renovar: string | null; dias: number;
};
export type Saude = { agora: string; automacoes: Automacao[]; filas: Fila[]; backup: Backup; chamadas?: Chamadas; vencimentos?: Vencimento[]; historico_linhas: number };

export type SituacaoAuto = "ok" | "instavel" | "atrasada" | "falhou" | "aguardando" | "desligada";
export const SITUACAO_AUTO: Record<SituacaoAuto, { nome: string; cor: string; ponto: string; grave: number }> = {
  falhou: { nome: "Falhou", cor: "bg-red-100 text-red-900 ring-red-300", ponto: "bg-red-500", grave: 0 },
  atrasada: { nome: "Atrasada", cor: "bg-orange-100 text-orange-900 ring-orange-300", ponto: "bg-orange-500", grave: 1 },
  instavel: { nome: "Falhou e voltou", cor: "bg-amber-100 text-amber-900 ring-amber-300", ponto: "bg-amber-500", grave: 2 },
  aguardando: { nome: "Ainda não rodou", cor: "bg-slate-100 text-slate-700 ring-slate-300", ponto: "bg-slate-400", grave: 3 },
  desligada: { nome: "Desligada", cor: "bg-slate-100 text-slate-700 ring-slate-300", ponto: "bg-slate-400", grave: 4 },
  ok: { nome: "Em dia", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300", ponto: "bg-emerald-500", grave: 5 },
};

/** Maior distância (em unidades do campo) entre duas rodadas: "*" = 1, "*\/5" = 5, "11,41" = 30, um número só = o ciclo todo. */
function maiorPasso(campo: string, ciclo: number): number {
  if (campo === "*") return 1;
  const passo = campo.match(/^\*\/(\d+)$/);
  if (passo) return Number(passo[1]);
  const v = campo.split(",").map(Number).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return ciclo;
  let maior = ciclo - v[v.length - 1] + v[0];
  for (let i = 1; i < v.length; i++) maior = Math.max(maior, v[i] - v[i - 1]);
  return maior;
}

/** De quanto em quanto tempo (minutos) a agenda roda, nos formatos usados no ERP. Dia, mês ou semana fixos: 7 dias de folga. */
export function intervaloCron(agenda: string): number {
  const [min = "*", hora = "*", dia = "*", mes = "*", semana = "*"] = agenda.trim().split(/\s+/);
  if (dia !== "*" || mes !== "*" || semana !== "*") return 7 * 1440;
  if (hora === "*") return min === "*" ? 1 : /^\*\/|,/.test(min) ? maiorPasso(min, 60) : 60;
  return maiorPasso(hora, 24) * 60;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
/** A agenda em português, no horário de Brasília (o agendador usa UTC; Brasília é UTC−3 o ano todo). */
export function agendaEmPortugues(agenda: string): string {
  const [min = "*", hora = "*", dia = "*", mes = "*", semana = "*"] = agenda.trim().split(/\s+/);
  if (dia !== "*" || mes !== "*" || semana !== "*") return agenda;
  if (hora === "*") {
    if (min === "*") return "a cada minuto";
    const passo = min.match(/^\*\/(\d+)$/);
    if (passo) return `a cada ${passo[1]} minutos`;
    if (min.includes(",")) return `a cada ${maiorPasso(min, 60)} minutos`;
    return "de hora em hora";
  }
  const passoH = hora.match(/^\*\/(\d+)$/);
  if (passoH) return `a cada ${passoH[1]} horas`;
  if (/^\d+$/.test(hora) && /^\d+$/.test(min)) return `todo dia às ${doisDigitos((Number(hora) + 21) % 24)}h${doisDigitos(Number(min))}`;
  return agenda;
}

/** Situação da automação agora: falhou na última rodada, atrasada (passou de 2 intervalos sem rodar), falhou e voltou… */
export function situacaoAutomacao(a: Automacao, agora: Date | string): SituacaoAuto {
  if (!a.ativo) return "desligada";
  if (!a.ultima) return "aguardando";
  // só "failed" é falha: "running"/"starting" é a rodada ainda em andamento
  if (a.ultima_situacao === "failed") return "falhou";
  const atraso = (new Date(agora).getTime() - new Date(a.ultima).getTime()) / 60000;
  if (atraso > 2 * intervaloCron(a.agenda) + 5) return "atrasada";
  if (a.falhas_24h > 0) return "instavel";
  return "ok";
}

/** O que cada automação faz, na língua da empresa. A que não estiver aqui aparece com o nome técnico. */
export const AUTOMACOES: Record<string, { nome: string; texto: string; tela?: string }> = {
  "erp-avisos-diarios": { nome: "Avisos do dia", texto: "Monta os lembretes do dia (vencimentos, garantias, preventivas).", tela: "/financeiro" },
  "erp-avisos-enviar": { nome: "Envio de e-mails", texto: "Manda os e-mails que estão na fila (lembretes e cobranças).", tela: "/financeiro?aba=cobranca" },
  "erp-backups-conferir": { nome: "Conferência do backup", texto: "Confere se o backup do dia chegou e se a cópia foi para a Hostinger.", tela: "/configuracoes" },
  "erp-clientes-receita": { nome: "Clientes na Receita", texto: "Confere clientes e fornecedores na Receita (CNPJá), 3 por minuto, de novo a cada 90 dias.", tela: "/clientes" },
  "erp-contador-pacote": { nome: "Pacote do contador", texto: "Monta e manda o fechamento do mês ao contador.", tela: "/contador" },
  "erp-contas-fixas": { nome: "Contas fixas", texto: "Lança as contas fixas e recorrentes do mês.", tela: "/financeiro" },
  "erp-email-caixa": { nome: "Caixa de e-mail", texto: "Busca e-mails novos (e os extratos OFX que chegam por e-mail).", tela: "/email" },
  "erp-inter": { nome: "Banco Inter", texto: "Extrato e saldo do Inter, a cada 4 horas.", tela: "/conciliacao" },
  "erp-mercadolivre": { nome: "Mercado Livre: vendas", texto: "Traz as vendas pagas do Mercado Livre.", tela: "/mercado-livre" },
  "erp-mercadolivre-anuncios": { nome: "Mercado Livre: anúncios", texto: "Manda o estoque e o preço do ERP para os anúncios.", tela: "/mercado-livre" },
  "erp-mercadolivre-posvenda": { nome: "Mercado Livre: NF-e e rastreio", texto: "Manda a NF-e autorizada e o rastreio do envio próprio para as vendas do Mercado Livre.", tela: "/mercado-livre" },
  "erp-mercadolivre-conferir": { nome: "Mercado Livre: conferência", texto: "Confere todos os anúncios uma vez por dia.", tela: "/mercado-livre" },
  "erp-nfe-processar": { nome: "Notas de fornecedor", texto: "Busca na SEFAZ as notas contra o CNPJ, faz a ciência e dá entrada.", tela: "/notas?aba=recebidas" },
  "erp-nfse-processar": { nome: "NFS-e", texto: "Acompanha as notas de serviço enviadas até autorizar.", tela: "/assistencia" },
  "erp-openfinance": { nome: "Open Finance", texto: "Extratos dos bancos conectados, a cada 4 horas.", tela: "/conciliacao" },
  "erp-parcelamentos-avisos": { nome: "Parcelamentos de impostos", texto: "Avisa as parcelas perto de vencer ou atrasadas.", tela: "/parcelamentos" },
  "erp-produtos-sugestoes": { nome: "Correções de produtos", texto: "Sugere NCM, custo, marca e código de barras pelas notas e compras.", tela: "/estoque?aba=qualidade" },
  "erp-regua-cobranca": { nome: "Régua de cobrança", texto: "Cobra as contas vencidas pelos canais da régua.", tela: "/configuracoes/cobranca" },
  "erp-vigiar-sistema": { nome: "Vigia do sistema", texto: "Confere tudo isto de hora em hora e avisa o administrador do que parou." },
  "erp-whatsapp-enviar": { nome: "Envio de WhatsApp", texto: "Manda as mensagens da fila do WhatsApp.", tela: "/financeiro?aba=cobranca" },
};

/** As filas que travam o trabalho quando crescem. `grave`: qualquer item já é problema. */
export const FILAS: Record<string, { nome: string; texto: string; tela: string; grave?: boolean }> = {
  nfe_erro: { nome: "NF-e com erro", texto: "Rejeitadas pela SEFAZ: corrigir e emitir de novo, ou cancelar o rascunho.", tela: "/notas", grave: true },
  nfe_vinculo: { nome: "Notas de fornecedor sem vínculo", texto: "Itens novos esperando ligar ao produto da MF para dar entrada.", tela: "/notas?aba=recebidas" },
  extrato: { nome: "Extrato a conciliar", texto: "Lançamentos do banco ainda sem conta ligada.", tela: "/conciliacao" },
  avisos: { nome: "E-mails que não saíram", texto: "Avisos que deram erro ao enviar (endereço, caixa de saída).", tela: "/financeiro?aba=cobranca", grave: true },
  whatsapp: { nome: "WhatsApp na fila ou com erro", texto: "Mensagens esperando sair ou que falharam.", tela: "/financeiro?aba=cobranca" },
  mercadolivre: { nome: "Mercado Livre com erro", texto: "Anúncios que não aceitaram o estoque ou o preço.", tela: "/mercado-livre", grave: true },
  sugestoes: { nome: "Sugestões de produtos", texto: "Correções de cadastro esperando aplicar ou ignorar.", tela: "/estoque?aba=qualidade" },
};

export type TipoChave = "certificado" | "chave" | "senha" | "dominio" | "outro";
export const TIPOS_CHAVE: Record<TipoChave, string> = {
  certificado: "Certificado digital", chave: "Chave de acesso (token)", senha: "Senha que expira", dominio: "Domínio ou site", outro: "Outro",
};

/** O que mais costuma parar o ERP quando vence: atalhos para cadastrar (a data a empresa preenche). */
export const SUGESTOES_CHAVES: { nome: string; tipo: TipoChave; onde: string; como_renovar: string; avisar_dias: number }[] = [
  { nome: "Certificado digital A1 · Matriz SC", tipo: "certificado", onde: "Focus NF-e (emissão das notas da matriz)", avisar_dias: 30,
    como_renovar: "Comprar o A1 novo na certificadora e enviar o arquivo na Focus NF-e da matriz." },
  { nome: "Certificado digital A1 · Filial SP", tipo: "certificado", onde: "Focus NF-e (emissão das notas da filial)", avisar_dias: 30,
    como_renovar: "Comprar o A1 novo na certificadora e enviar o arquivo na Focus NF-e da filial." },
  { nome: "Chave do Supabase no GitHub", tipo: "chave", onde: "GitHub → Settings → Secrets → SUPABASE_ACCESS_TOKEN (backup e funções)", avisar_dias: 15,
    como_renovar: "Gerar outra chave no Supabase (Account → Access Tokens) e trocar o secret no GitHub." },
  { nome: "Domínio e hospedagem do ERP", tipo: "dominio", onde: "Hostinger (domínio e hospedagem do site)", avisar_dias: 30,
    como_renovar: "Renovar o domínio e a hospedagem na Hostinger." },
];

export type SituacaoVencimento = "vencido" | "urgente" | "perto" | "ok";
/** Vencido, 3 dias ou menos (urgente), dentro do prazo de aviso (perto) ou em dia. */
export const situacaoVencimento = (v: Pick<Vencimento, "dias" | "avisar_dias">): SituacaoVencimento =>
  v.dias < 0 ? "vencido" : v.dias <= 3 ? "urgente" : v.dias <= v.avisar_dias ? "perto" : "ok";

/** Dias (inteiros) entre duas datas. */
export const diasDesde = (de: string, agora: Date | string) => Math.floor((new Date(agora).getTime() - new Date(de).getTime()) / 864e5);

/** Backup: em dia (cópia guardada nas últimas 30 horas) ou parado, com quantos dias. */
export function situacaoBackup(b: Backup, agora: Date | string): { ok: boolean; dias: number | null; texto: string } {
  if (b.ultimo_ok && (new Date(agora).getTime() - new Date(b.ultimo_ok).getTime()) / 36e5 <= 30) return { ok: true, dias: 0, texto: "Cópia guardada nas últimas 30 horas" };
  const dias = b.ultimo_ok ? diasDesde(b.ultimo_ok, agora) : null;
  const semRegistro = !b.ultimo || (new Date(agora).getTime() - new Date(b.ultimo.em).getTime()) / 36e5 > 30;
  return {
    ok: false, dias,
    texto: (dias === null ? "Nenhuma cópia guardada até hoje" : `${dias} dias sem cópia guardada`)
      + (semRegistro ? "; o backup de hoje nem avisou o ERP" : b.falhas_seguidas ? `; ${b.falhas_seguidas} tentativa(s) com erro seguidas` : ""),
  };
}

export type Resumo = { nivel: "ok" | "atencao" | "critico"; problemas: string[]; contagem: Record<SituacaoAuto, number> };

/** Tudo numa frase por problema, do mais grave ao mais leve. Serve para o semáforo e para o diagnóstico do registro. */
export function resumoSaude(s: Saude, agora: Date | string): Resumo {
  const contagem = { ok: 0, instavel: 0, atrasada: 0, falhou: 0, aguardando: 0, desligada: 0 } as Record<SituacaoAuto, number>;
  const graves: string[] = [], leves: string[] = [];
  const bk = situacaoBackup(s.backup, agora);
  if (!bk.ok) graves.push(`Backup: ${bk.texto}`);
  for (const a of s.automacoes) {
    const sit = situacaoAutomacao(a, agora);
    contagem[sit]++;
    const nome = AUTOMACOES[a.nome]?.nome ?? a.nome;
    if (sit === "falhou") graves.push(`Automação ${nome}: falhou na última rodada${a.ultimo_erro ? ` (${a.ultimo_erro.slice(0, 80)})` : ""}`);
    if (sit === "atrasada") graves.push(`Automação ${nome}: não roda desde ${new Date(a.ultima!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    if (sit === "instavel") leves.push(`Automação ${nome}: ${a.falhas_24h} falha(s) nas últimas 24 horas`);
  }
  for (const v of s.vencimentos ?? []) {
    const sit = situacaoVencimento(v);
    if (sit === "vencido") graves.push(`${v.nome}: venceu há ${-v.dias} ${v.dias === -1 ? "dia" : "dias"}`);
    else if (sit === "urgente") graves.push(`${v.nome}: vence ${v.dias === 0 ? "hoje" : `em ${v.dias} ${v.dias === 1 ? "dia" : "dias"}`}`);
    else if (sit === "perto") leves.push(`${v.nome}: vence em ${v.dias} dias`);
  }
  if (s.chamadas && s.chamadas.erro > 0) (s.chamadas.erro >= 3 ? graves : leves).push(`Funções do ERP: ${s.chamadas.erro} chamada(s) com erro nas últimas 6 horas`);
  for (const f of s.filas) {
    if (!f.qtd) continue;
    const def = FILAS[f.chave];
    const txt = `${def?.nome ?? f.chave}: ${f.qtd}${f.chave === "extrato" && f.total ? ` de ${f.total} (${Math.round((f.qtd / f.total) * 100)}%)` : ""}`;
    (def?.grave ? graves : leves).push(txt);
  }
  return { nivel: graves.length ? "critico" : leves.length ? "atencao" : "ok", problemas: [...graves, ...leves], contagem };
}

// ---------------------------------------------------------------------------------------------------------------------
// Registro das execuções: entrada → diagnóstico → decisão → entrega → validação → próxima ação.

export type Etapa = "entrada" | "diagnostico" | "decisao" | "entrega" | "validacao" | "proxima_acao";
export const ETAPAS: { id: Etapa; nome: string; dica: string }[] = [
  { id: "entrada", nome: "Entrada", dica: "O que foi pedido: o comando e o contexto." },
  { id: "diagnostico", nome: "Diagnóstico", dica: "O que foi achado, com os números e de onde vieram." },
  { id: "decisao", nome: "Decisão", dica: "O que se decidiu fazer (e o que não) e por quê." },
  { id: "entrega", nome: "Entrega", dica: "O que ficou pronto: tela, arquivo, aviso, correção." },
  { id: "validacao", nome: "Validação", dica: "Como se conferiu que funcionou (teste, número antes e depois)." },
  { id: "proxima_acao", nome: "Próxima ação", dica: "O que vem agora, de quem e até quando." },
];

export type SituacaoExecucao = "em_andamento" | "concluida" | "bloqueada";
export const SITUACOES_EXECUCAO: Record<SituacaoExecucao, { nome: string; cor: string }> = {
  em_andamento: { nome: "Em andamento", cor: "bg-sky-100 text-sky-900 ring-sky-300" },
  concluida: { nome: "Concluída", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  bloqueada: { nome: "Bloqueada", cor: "bg-red-100 text-red-900 ring-red-300" },
};
export const ORIGENS_EXECUCAO: Record<string, string> = { erp: "Na tela", claude: "Claude", monitor: "Vigia automático" };

export type Execucao = { id: string; comando: string; alvo: string | null; situacao: SituacaoExecucao; origem: string; criado_em: string } & Record<Etapa, string | null>;

/** Quantas das 6 etapas estão preenchidas: a execução só fecha com todas. */
export const etapasPreenchidas = (e: Partial<Record<Etapa, string | null>>) => ETAPAS.filter((x) => (e[x.id] ?? "").trim()).length;

/** Diagnóstico pronto para o registro de uma verificação do Monitor. */
export function diagnosticoMonitor(s: Saude, agora: Date | string): string {
  const r = resumoSaude(s, agora);
  const total = s.automacoes.length;
  const linhas = [`${r.contagem.ok + r.contagem.aguardando} de ${total} automações em dia ou esperando a 1ª rodada.`];
  if (s.chamadas) linhas.push(`Funções nas últimas 6 horas: ${s.chamadas.ok} ok, ${s.chamadas.erro} com erro.`);
  linhas.push(...(r.problemas.length ? r.problemas : ["Nada parado."]));
  return linhas.join("\n");
}
