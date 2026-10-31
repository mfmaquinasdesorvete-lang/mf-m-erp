// CRM para a equipe aprender (pedido da usuária, 31/10): o passo a passo em cartões no alto da tela de Oportunidades,
// um por etapa, com o botão que se aperta e um exemplo. Dá para esconder (fica lembrado só neste navegador).
import { useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, CircleCheck, FileText, GraduationCap, MessageCircle, UserPlus, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { ETAPAS_OP } from "@/lib/oportunidades";

const cor = (id: string) => ETAPAS_OP.find((e) => e.id === id)?.cor ?? "#64748b";

const PASSOS: { icone: LucideIcon; cor: string; titulo: string; texto: string; botao: string; exemplo: string }[] = [
  { icone: UserPlus, cor: cor("novo"), titulo: "1. Chegou um contato",
    texto: "Toda pessoa interessada vira uma oportunidade: o que ela quer, quem é (cliente ou só nome e WhatsApp), valor estimado, responsável e como chegou.",
    botao: "Nova oportunidade", exemplo: "\"2 máquinas para sorveteria nova\" · R$ 38 mil · veio do Instagram" },
  { icone: MessageCircle, cor: cor("conversa"), titulo: "2. Falou com a pessoa",
    texto: "Depois do primeiro contato, aperte o botão no cartão. Contato novo sem conversa fica amarelo em 1 dia e vermelho em 3.",
    botao: "Comecei a conversa", exemplo: "Ligou, entendeu o que precisa e anotou nas Notas" },
  { icone: FileText, cor: cor("proposta"), titulo: "3. Mandou a proposta",
    texto: "Em \"Orçamento ou pedido\", use Fazer orçamento (abre a venda já com o cliente) ou ligue um que já existe. Depois aperte o botão.",
    botao: "Mandei a proposta", exemplo: "5 dias sem resposta: o cartão fica amarelo para cobrar o cliente" },
  { icone: CircleCheck, cor: cor("ganho"), titulo: "4. Fechou ou não fechou",
    texto: "Ganhou: aperte Ganhou (ou aprove o orçamento ligado, que vira Ganho sozinho). Perdeu: abra o cartão, mude a etapa para Perdido e escolha o motivo.",
    botao: "Ganhou / Perdido", exemplo: "Perdido por \"Preço\" ou \"Comprou de outro\": mostra onde melhorar" },
  { icone: BarChart3, cor: "#6366f1", titulo: "5. Acompanhe",
    texto: "Na aba Métricas: valor no funil, taxa de ganho, conversão por etapa e por pessoa, tempo em cada etapa e motivos de perda.",
    botao: "Métricas", exemplo: "Use os filtros de responsável e marcador para ver cada um" },
];

const CHAVE = "crm-passo-a-passo-fechado";
const lerFechado = () => { try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; } };

export function PassoAPasso() {
  const [aberto, setAberto] = useState(() => !lerFechado());
  const trocar = () => {
    const novo = !aberto;
    setAberto(novo);
    try { localStorage.setItem(CHAVE, novo ? "0" : "1"); } catch { /* navegador sem armazenamento: só não lembra */ }
  };
  return (
    <Card className="p-3 sm:p-4">
      <button type="button" onClick={trocar} aria-expanded={aberto} className="flex w-full items-center gap-2 text-left">
        <GraduationCap size={18} className="shrink-0 text-modulo-texto" aria-hidden />
        <span className="flex-1 text-sm font-bold text-fg">Como usar o CRM: passo a passo para a equipe</span>
        <span className="text-xs text-slate-500">{aberto ? "esconder" : "mostrar"}</span>
        {aberto ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {aberto && (
        <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PASSOS.map(({ icone: Icone, ...p }) => (
            <li key={p.titulo} className="flex flex-col rounded-xl border border-slate-200 border-t-4 p-3" style={{ borderTopColor: p.cor }}>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: p.cor }}><Icone size={16} aria-hidden /></span>
                <b className="text-sm text-fg">{p.titulo}</b>
              </div>
              <p className="mt-2 flex-1 text-sm text-slate-600">{p.texto}</p>
              <p className="mt-2 text-xs text-slate-500">Botão: <span className="font-semibold text-fg">{p.botao}</span></p>
              <p className="mt-1 text-xs text-slate-500">Exemplo: {p.exemplo}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
