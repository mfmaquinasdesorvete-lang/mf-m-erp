// Scrum para quem nunca usou: o passo a passo em palavras simples (cada passo abre a aba certa) e exemplos prontos
// da equipe aberta, que vão para o backlog com um toque (um por um ou todos); embaixo, as boas práticas de BDD e as
// regras da MF já escritas em cenários.
import { useState } from "react";
import { ChevronDown, ChevronUp, GraduationCap, ListPlus, Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { prioridadeNoFim, ROTULO_TIPO, type ItemScrum, type TimeScrum, type TipoItem } from "@/lib/scrum";
import { BddMf } from "./BddMf";

type Aba = "quadro" | "backlog" | "sprints" | "daily" | "painel" | "equipe";
type Exemplo = { titulo: string; tipo: TipoItem; pontos: number; criterio: string };

const PASSOS: { aba: Aba; titulo: string; texto: string; exemplo: string }[] = [
  { aba: "backlog", titulo: "1. Backlog: a lista do que precisa ser feito",
    texto: "Anote tudo o que a equipe precisa fazer, uma coisa por linha. O mais importante fica em cima (use as setas).",
    exemplo: "\"Contar os O-rings e acertar o estoque\"" },
  { aba: "backlog", titulo: "2. Pontos: o tamanho de cada trabalho",
    texto: "1 = coisa de minutos · 2 ou 3 = algumas horas · 5 = meio dia a um dia · 8 = dois ou três dias · 13 = grande demais, quebre em partes.",
    exemplo: "Contar os O-rings = 3 pontos" },
  { aba: "sprints", titulo: "3. Sprint: o combinado da semana (ou de 2 semanas)",
    texto: "Escolha no backlog o que dá para fazer no período e mande para a sprint (botão \"Sprint →\" na linha). Escreva o objetivo e toque em Iniciar.",
    exemplo: "Objetivo: \"Entregar as máquinas vendidas da semana já testadas\"" },
  { aba: "quadro", titulo: "4. Quadro: o andamento do dia a dia",
    texto: "Cada cartão anda da esquerda para a direita: A fazer → Fazendo → Revisão (alguém confere) → Feito.",
    exemplo: "Começou a contar? Arraste para Fazendo. Terminou? Para Feito." },
  { aba: "daily", titulo: "5. Daily: 3 respostas curtas por dia",
    texto: "O que fiz ontem, o que vou fazer hoje e o que está me travando (impedimento). Leva 1 minuto por pessoa.",
    exemplo: "Travando: \"falta o anel 3/8 para fechar a A200\"" },
  { aba: "sprints", titulo: "6. Fim da sprint: revisão e retrospectiva",
    texto: "Ao encerrar, conte o que foi entregue, o que foi bom e o que melhorar. O que não terminou volta para o alto do backlog.",
    exemplo: "Melhorar: \"separar as peças na véspera\"" },
  { aba: "painel", titulo: "7. Painel: a equipe está no ritmo?",
    texto: "O gráfico mostra se os pontos estão sendo feitos a tempo (burndown) e quantos pontos a equipe faz por sprint (velocidade).",
    exemplo: "Velocidade 20 = planeje cerca de 20 pontos na próxima sprint" },
];

/** Exemplos prontos por equipe (pelo nome); equipe com outro nome usa os da Produção. */
const EXEMPLOS: Record<string, { objetivo: string; itens: Exemplo[] }> = {
  "produção": { objetivo: "Entregar as máquinas vendidas da semana já testadas", itens: [
    { titulo: "Montar as máquinas dos pedidos aprovados da semana", tipo: "historia", pontos: 8, criterio: "Máquinas montadas, com teste do giga aprovado e etiqueta" },
    { titulo: "Contar os O-rings e acertar o estoque no ERP", tipo: "tarefa", pontos: 3, criterio: "Contagem lançada em Produtos → Contagem de estoque" },
    { titulo: "Tornear os eixos das pás batedoras", tipo: "tarefa", pontos: 5, criterio: "Eixos prontos e enviados para a injeção" },
    { titulo: "Combinar o prazo da injeção das pás com o terceiro", tipo: "tarefa", pontos: 1, criterio: "Data de volta anotada na etapa da OP" },
    { titulo: "Acabamento das pás que voltaram da injeção", tipo: "tarefa", pontos: 3, criterio: "Pás conferidas e no estoque" },
  ] },
  "assistência": { objetivo: "Nenhuma OS parada mais de 5 dias", itens: [
    { titulo: "Responder as OS abertas há mais de 5 dias", tipo: "tarefa", pontos: 3, criterio: "Todas com retorno ao cliente anotado na OS" },
    { titulo: "Montar o kit das peças que mais trocamos", tipo: "melhoria", pontos: 2, criterio: "Kit separado e cadastrado" },
    { titulo: "Vídeo chamada com os clientes fora da garantia", tipo: "tarefa", pontos: 2, criterio: "Taxa lançada na OS" },
    { titulo: "Revisar o checklist da entrega técnica", tipo: "melhoria", pontos: 3, criterio: "Checklist novo no texto padrão da OS" },
  ] },
  "vendas": { objetivo: "Responder todo orçamento em até 1 dia", itens: [
    { titulo: "Ligar para os orçamentos sem resposta da semana", tipo: "tarefa", pontos: 3, criterio: "Motivo anotado em cada orçamento perdido" },
    { titulo: "Mandar proposta para os contatos novos", tipo: "historia", pontos: 5, criterio: "Propostas enviadas pelo ERP" },
    { titulo: "Atualizar as fotos dos anúncios das pás e eixos", tipo: "melhoria", pontos: 5, criterio: "Fotos novas no cadastro e no Mercado Livre" },
    { titulo: "Conferir o frete das vendas para o Nordeste", tipo: "tarefa", pontos: 2, criterio: "Frete cotado em todas" },
  ] },
  "financeiro": { objetivo: "Fechar o mês sem pendência para o contador", itens: [
    { titulo: "Conciliar as vendas com o extrato (Vendas → marcar → Conciliar)", tipo: "tarefa", pontos: 3, criterio: "Sem venda recebida com \"Sem conta a receber\"" },
    { titulo: "Cobrar as contas vencidas", tipo: "tarefa", pontos: 2, criterio: "Cliente avisado e data de pagamento anotada" },
    { titulo: "Separar as notas do mês para o contador", tipo: "tarefa", pontos: 3, criterio: "Pacote do mês enviado no Painel do contador" },
    { titulo: "Conferir os pagamentos agendados da semana", tipo: "tarefa", pontos: 1, criterio: "Todos aprovados ou adiados" },
  ] },
  "erp line": { objetivo: "Deixar o ERP pronto para largar o Tiny", itens: [
    { titulo: "Cadastrar a ficha técnica da pá batedora (etapas e peças)", tipo: "tarefa", pontos: 3, criterio: "Ficha com tornearia → injeção → acabamento" },
    { titulo: "Completar os produtos sem custo", tipo: "tarefa", pontos: 5, criterio: "Nenhum produto da ficha com \"sem custo\"" },
    { titulo: "Treinar a equipe no Conciliar das vendas", tipo: "historia", pontos: 2, criterio: "Cada pessoa conciliou uma venda sozinha" },
  ] },
};

export function ComoUsar({ time, backlog, todos, aberto, onAberto, irPara }: {
  time: TimeScrum; backlog: ItemScrum[]; todos: ItemScrum[]; aberto: boolean; onAberto: (v: boolean) => void; irPara: (aba: Aba) => void;
}) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const ex = EXEMPLOS[time.nome.trim().toLowerCase()] ?? EXEMPLOS["produção"];
  const jaTem = (t: string) => backlog.some((i) => i.titulo.trim().toLowerCase() === t.toLowerCase());
  const faltam = ex.itens.filter((e) => !jaTem(e.titulo));

  async function por(lista: Exemplo[]) {
    if (!lista.length) return;
    setOcupado(true);
    let prioridade = prioridadeNoFim(backlog);
    const linhas = lista.map((e) => ({ time_id: time.id, titulo: e.titulo, tipo: e.tipo, pontos: e.pontos, criterio_aceite: e.criterio, prioridade: (prioridade += 10) - 10 }));
    const { error } = await supabase.from("scrum_itens").insert(linhas);
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`${lista.length} ${pl(lista.length, "item foi", "itens foram")} para o backlog de ${time.nome}. Mude o que quiser.`);
    invalidar("scrum_itens");
  }

  return (
    <Card className="mb-4 p-3 sm:p-4">
      <button type="button" onClick={() => onAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center gap-2 text-left">
        <GraduationCap size={18} className="shrink-0 text-modulo-texto" aria-hidden />
        <span className="flex-1 text-sm font-bold text-fg">Como usar o Scrum (passo a passo com exemplos)</span>
        {aberto ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {aberto && (<>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <ol className="space-y-2">
            {PASSOS.map((p) => (
              <li key={p.titulo} className="rounded-xl border border-slate-200 p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-sm text-fg">{p.titulo}</b>
                  <button type="button" onClick={() => irPara(p.aba)} className="text-xs font-semibold text-modulo-texto hover:underline">abrir {p.aba === "quadro" ? "o Quadro" : p.aba === "daily" ? "a Daily" : p.aba === "painel" ? "o Painel" : p.aba === "sprints" ? "as Sprints" : "o Backlog"} →</button>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{p.texto}</p>
                <p className="mt-1 text-xs text-slate-500">Exemplo: {p.exemplo}</p>
              </li>
            ))}
          </ol>
          <div className="min-w-0 rounded-xl border border-dashed border-slate-300 p-3">
            <p className="text-sm font-bold text-fg">Exemplos prontos para {time.nome}</p>
            <p className="mb-2 text-xs text-slate-500">Objetivo de sprint sugerido: <b className="text-fg">{ex.objetivo}</b></p>
            <ul className="space-y-1.5">
              {ex.itens.map((e) => (
                <li key={e.titulo} className="flex items-start gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="text-fg">{e.titulo}</span>
                    <span className="block text-xs text-slate-500">{ROTULO_TIPO[e.tipo]} · {e.pontos} {pl(e.pontos, "ponto", "pontos")} · pronto quando: {e.criterio}</span>
                  </span>
                  {jaTem(e.titulo)
                    ? <span className="shrink-0 text-xs font-semibold text-emerald-700">no backlog</span>
                    : <Button type="button" variant="secondary" className="!min-h-0 shrink-0 !px-2 !py-1 text-xs" disabled={ocupado} onClick={() => por([e])}><Plus size={13} aria-hidden /> Pôr</Button>}
                </li>
              ))}
            </ul>
            {faltam.length > 0 && (
              <Button type="button" className="mt-3 w-full" disabled={ocupado} onClick={() => por(faltam)}>
                <ListPlus size={16} aria-hidden /> Pôr {faltam.length === ex.itens.length ? "todos" : `os ${faltam.length} que faltam`} no backlog
              </Button>
            )}
            <p className="mt-2 text-2xs text-slate-500">Depois é só mudar o texto e os pontos para o jeito da equipe.</p>
          </div>
        </div>
        <BddMf time={time} backlog={backlog} todos={todos} />
      </>)}
    </Card>
  );
}
