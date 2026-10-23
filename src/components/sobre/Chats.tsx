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

type Chat = { id: string; ordem: number; nome: string; faz: string; exemplos: string | null; sessao: string; cor: string; ativo: boolean };

const CORES: Record<string, string> = {
  slate: "from-[#475569] to-[#1e293b]", azul: "from-blue-500 to-blue-700", verde: "from-emerald-500 to-emerald-700",
  teal: "from-teal-500 to-teal-700", ambar: "from-amber-500 to-orange-600", rosa: "from-pink-500 to-rose-600",
  violeta: "from-violet-500 to-purple-700", vermelho: "from-red-500 to-red-700", indigo: "from-indigo-500 to-indigo-700",
};

const link = (sessao: string) => `https://claude.ai/code/${sessao}`;
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Chats() {
  const { data = [], isLoading } = useRows<Chat>("chats_claude", { order: "ordem", ascending: true });
  const [busca, setBusca] = useState("");
  const ativos = data.filter((c) => c.ativo);
  const termo = semAcento(busca.trim());
  const visiveis = ativos.filter((c) => !termo || semAcento(`${c.nome} ${c.faz} ${c.exemplos ?? ""}`).includes(termo));

  return (
    <div className="space-y-4">
      <CentralChats chats={data} />
      <p className="text-sm text-slate-600">
        Cada chat cuida só do seu assunto e todos seguem as mesmas regras (só um publica por vez, tudo entra em Pedidos).
        Para chegar rápido: toque em <b>Abrir chat</b>. No app do Claude, os chats ficam em <b>Code</b>, com o mesmo nome.
        Não sabe para qual chat levar? Escreva no chat principal.
      </p>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por assunto (ex.: nota, Tiny, extrato)" />
      </div>

      {isLoading && <p className="py-6 text-center text-slate-500">Carregando…</p>}
      {!isLoading && !visiveis.length && <p className="py-6 text-center text-slate-500">{ativos.length ? "Nenhum chat com esse assunto." : "Nenhum chat cadastrado ainda."}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {visiveis.map((c) => (
          <Card key={c.id} className="flex flex-col overflow-hidden">
            <div className={`bg-gradient-to-r ${CORES[c.cor] ?? CORES.slate} px-4 py-3 text-white`}>
              <h3 className="font-bold">{c.nome.replace(/^ERP Line – /, "")}</h3>
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
