// Fluxo BDD do item do Scrum: as cinco etapas em ordem (conversa → critérios → cenários → sem duplicidade → testes),
// com um botão que roda tudo e o resultado de cada etapa. As regras ficam em lib/fluxoBdd; nada grava até o Salvar.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Copy, Download, FlaskConical, MessagesSquare, Play, SearchCheck, Workflow } from "lucide-react";
import { Button } from "@/components/ui";
import { ler } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { arquivoFeature, arquivoPlaywright, nomeArquivo, rodarFluxo, type ResultadoFluxo } from "@/lib/fluxoBdd";
import type { CasoTeste, ComentarioScrum, ItemScrum, TipoItem } from "@/lib/scrum";
import { nomeDe, type Pessoa } from "./comum";

type Base = { titulo: string; tipo: TipoItem; descricao: string; criterio_aceite: string; pontos: number | null; responsavel_id: string; cenarios: string; testes: CasoTeste[] };

const ETAPAS = [
  { nome: "Summarizer", texto: "resume a conversa da equipe e separa as regras combinadas (quem e quando)", Icone: MessagesSquare },
  { nome: "Smart-Acceptance", texto: "junta as regras aos critérios de aceite: o que precisa ser aceito", Icone: BadgeCheck },
  { nome: "Smart-BDD", texto: "transforma os critérios em comportamento: Dado / Quando / Então", Icone: Workflow },
  { nome: "AI Suggest", texto: "procura cenários parecidos em outros itens, para não duplicar", Icone: SearchCheck },
  { nome: "Test-Gen", texto: "cria os casos de teste e os arquivos de teste executáveis", Icone: FlaskConical },
];

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FluxoBdd({ r, item, todosItens, pessoas, onAplicar, onAbrir }: {
  r: Base; item: ItemScrum | null; todosItens: ItemScrum[]; pessoas: Pessoa[];
  onAplicar: (f: ResultadoFluxo, linhas: string[]) => void; onAbrir?: (i: ItemScrum) => void;
}) {
  const [res, setRes] = useState<ResultadoFluxo | null>(null);
  const { data: comentarios = [] } = useQuery({
    queryKey: ["scrum_comentarios", item?.id],
    enabled: !!item,
    queryFn: async () => ((await ler(supabase.from("scrum_comentarios").select("*").eq("item_id", item!.id).order("created_at"))) ?? []) as ComentarioScrum[],
  });

  function rodar() {
    if (!r.titulo.trim()) return notify("Escreva o título primeiro: o fluxo parte dele.", "erro");
    const f = rodarFluxo(r, comentarios.map((c) => ({ nome: nomeDe(pessoas, c.user_id), texto: c.texto, created_at: c.created_at })),
      todosItens.map((i) => ({ id: i.id, titulo: i.titulo, cenarios: i.cenarios })), item?.id);
    setRes(f);
    const n = (f.cenarios.match(/Cen[áa]rio\s*:/gi) ?? []).length;
    onAplicar(f, [
      `1. Conversa: ${f.regras.length ? `${f.regras.length} ${pl(f.regras.length, "regra combinada", "regras combinadas")}` : item ? "nenhuma regra combinada nos comentários" : "salve o item para a conversa entrar"}.`,
      `2. Critérios: ${f.novosCriterios > 0 ? `${f.novosCriterios} ${pl(f.novosCriterios, "linha nova", "linhas novas")}` : "nada novo"}.`,
      `3. Cenários: ${n} no formato Dado / Quando / Então.`,
      `4. Duplicidade: ${f.repetidos.length ? `${f.repetidos.length} ${pl(f.repetidos.length, "cenário parecido", "cenários parecidos")} em outros itens (veja abaixo)` : "nenhum cenário repetido"}.`,
      `5. Testes: ${f.novosTestes} ${pl(f.novosTestes, "caso novo", "casos novos")}; baixe o .feature e o teste automático abaixo.`,
    ]);
  }

  const arquivo = nomeArquivo(r.titulo);
  const temCenarios = !!r.cenarios.trim();
  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-surface p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-indigo-900">Fluxo BDD <span className="font-normal text-indigo-800">— regra → critério → comportamento → teste</span></p>
        <Button type="button" className="!min-h-0 !py-1.5 text-xs" onClick={rodar}><Play size={14} aria-hidden /> Rodar o fluxo</Button>
      </div>
      <ol className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-5">
        {ETAPAS.map(({ nome, texto, Icone }, k) => (
          <li key={nome} className="flex gap-1.5 rounded-md bg-indigo-50/70 p-1.5 sm:flex-col sm:gap-0.5">
            <span className="flex shrink-0 items-center gap-1 font-bold text-indigo-900"><Icone size={13} aria-hidden /> {k + 1}. {nome}</span>
            <span className="min-w-0">{texto}</span>
          </li>
        ))}
      </ol>
      {res && res.regras.length > 0 && (
        <div className="mt-2 text-xs">
          <p className="font-bold text-slate-700">Regras que vieram da conversa</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-slate-700">
            {res.regras.map((g, k) => <li key={k}>{g.texto} <span className="text-slate-500">— {g.nome}, {g.data.slice(8, 10)}/{g.data.slice(5, 7)}</span></li>)}
          </ul>
        </div>
      )}
      {res && res.repetidos.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-bold">Cenários parecidos em outros itens — reaproveite ou ajuste para não duplicar</p>
          <ul className="mt-1 space-y-1">
            {res.repetidos.map((p, k) => {
              const outro = todosItens.find((i) => i.id === p.itemId);
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-1.5">
                  <b>"{p.cenario}"</b> ≈ "{p.outroCenario}" em
                  {outro && onAbrir ? <button type="button" className="font-semibold underline" onClick={() => onAbrir(outro)}>{p.itemTitulo}</button> : <span>{p.itemTitulo}</span>}
                  <span className="text-amber-800">· {Math.round(p.score * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {temCenarios && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button type="button" variant="secondary" className="!min-h-0 !py-1.5 text-xs" onClick={() => baixar(`${arquivo}.feature`, arquivoFeature(r.titulo, r.cenarios))}>
            <Download size={13} aria-hidden /> Baixar .feature
          </Button>
          <Button type="button" variant="secondary" className="!min-h-0 !py-1.5 text-xs" onClick={() => baixar(`${arquivo}.spec.ts`, arquivoPlaywright(r.titulo, r.cenarios))}>
            <Download size={13} aria-hidden /> Baixar teste automático
          </Button>
          <Button type="button" variant="ghost" className="!min-h-0 !py-1.5 text-xs"
            onClick={() => navigator.clipboard.writeText(arquivoPlaywright(r.titulo, r.cenarios)).then(() => notify("Teste automático copiado"), () => notify("Não deu para copiar", "erro"))}>
            <Copy size={13} aria-hidden /> Copiar o teste
          </Button>
        </div>
      )}
    </div>
  );
}
