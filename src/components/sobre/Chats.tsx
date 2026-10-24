// Sobre o ERP Line → Chats: no alto a Central dos chats (quem está publicando, linha do tempo e placar); embaixo os chats
// do Claude que trabalham no ERP, um por assunto, com o que cada um faz, exemplos
// do que levar para ele e o botão para abrir direto (o link só abre na conta dona dos chats). A lista fica na tabela
// chats_claude, só para o administrador; quem abre um chat novo acrescenta a linha (veja o CLAUDE.md).
import { useState } from "react";
import { Copy, ExternalLink, Search } from "lucide-react";
import { Button, Card, CLASSE_BOTAO } from "@/components/ui";
import { useRows } from "@/lib/data";
import { copiar } from "./Guardanapo";
import { CentralChats } from "./CentralChats";

type Chat = { id: string; ordem: number; sigla: string | null; nome: string; faz: string; exemplos: string | null; sessao: string; cor: string; ativo: boolean };

const CORES: Record<string, string> = {
  slate: "bg-fixo-slate-800", azul: "bg-fixo-sky-700", verde: "bg-fixo-emerald-700",
  teal: "bg-fixo-teal-700", ambar: "bg-fixo-orange-600", rosa: "bg-fixo-rose-600",
  violeta: "bg-fixo-purple-700", vermelho: "bg-fixo-red-700", indigo: "bg-fixo-indigo-700",
};

const link = (sessao: string) => `https://claude.ai/code/${sessao}`;
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Chats() {
  const { data = [], isLoading } = useRows<Chat>("chats_claude", { order: "ordem", ascending: true });
  const [busca, setBusca] = useState("");
  const ativos = data.filter((c) => c.ativo);
  const termo = semAcento(busca.trim());
  const visiveis = ativos.filter((c) => !termo || semAcento(`${c.sigla ?? ""} ${c.nome} ${c.faz} ${c.exemplos ?? ""}`).includes(termo));

  return (
    <div className="space-y-4">
      <CentralChats chats={data} />
      <p className="text-sm text-slate-600">
        Cada chat cuida só do seu assunto e todos seguem as mesmas regras (só um publica por vez, tudo entra em Pedidos).
        Para chegar rápido: toque em <b>Abrir chat</b>. No app do Claude, os chats ficam em <b>Code</b>, com o mesmo nome.
        Não sabe para qual chat levar? Escreva no chat principal (ELO, o CEO dos chats). Cada chat tem um nome de 3 letras e
        uma skill que lembra o que ele faz e as regras da casa.
      </p>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input aria-label="Procurar chat por assunto" className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por assunto ou sigla (ex.: nota, Tiny, FIS)" />
      </div>

      {isLoading && <p className="py-6 text-center text-slate-500">Carregando…</p>}
      {!isLoading && !visiveis.length && <p className="py-6 text-center text-slate-500">{ativos.length ? "Nenhum chat com esse assunto." : "Nenhum chat cadastrado ainda."}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {visiveis.map((c) => (
          <Card key={c.id} className="flex flex-col overflow-hidden">
            <div className={`${CORES[c.cor] ?? CORES.slate} px-4 py-3 text-white`}>
              <h3 className="flex items-center gap-2 font-bold">
                {c.sigla && <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs tracking-wider" title="Nome de 3 letras do chat">{c.sigla}</span>}
                {c.nome.replace(/^ERP Line – /, "")}
              </h3>
              <span className="text-xs opacity-90">{c.nome}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-sm text-fg">{c.faz}</p>
              {c.exemplos && <p className="text-xs text-slate-500">Exemplos: {c.exemplos}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <a href={link(c.sessao)} target="_blank" rel="noreferrer" className={`${CLASSE_BOTAO} bg-brand text-brand-fg shadow-sm hover:bg-brand-dark`}>
                  <ExternalLink size={16} /> Abrir chat
                </a>
                <Button type="button" variant="secondary" onClick={() => copiar(link(c.sessao), "Link do chat copiado")}>
                  <Copy size={16} /> Copiar link
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
