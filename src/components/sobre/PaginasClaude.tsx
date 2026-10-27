// Sobre o ERP Line → Páginas: as páginas que os chats do Claude fizeram para a usuária (análises, painéis, planos,
// manuais), agrupadas por assunto, da mais nova para a mais antiga, com o botão para abrir. A lista fica na tabela
// paginas_claude, só para o administrador; o link só abre para quem a dona compartilhou a página.
import { useState } from "react";
import { Copy, ExternalLink, Search } from "lucide-react";
import { Button, Card, CLASSE_BOTAO, Carregando, Vazio } from "@/components/ui";
import { useRows } from "@/lib/data";
import { copiar } from "./Guardanapo";

type Pagina = { id: string; titulo: string; link: string; descricao: string | null; assunto: string; feita_em: string; ativo: boolean };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dataBr = (d: string) => d.split("-").reverse().join("/");

export function PaginasClaude() {
  const { data = [], isLoading } = useRows<Pagina>("paginas_claude", { order: "feita_em", ascending: false });
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca.trim());
  const visiveis = data.filter((p) => p.ativo && (!termo || semAcento(`${p.titulo} ${p.descricao ?? ""} ${p.assunto}`).includes(termo)));
  const assuntos = [...new Set(visiveis.map((p) => p.assunto))];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Páginas que os chats fizeram para você: análises, painéis, planos e manuais. Cada uma abre numa aba nova. Para
        mostrar a alguém da equipe, compartilhe pelo botão Compartilhar da própria página.
      </p>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input aria-label="Procurar página" className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por nome ou assunto (ex.: Raio-X, contador, manual)" />
      </div>

      {isLoading && <Carregando />}
      {!isLoading && !visiveis.length && <Vazio titulo={data.length ? "Nenhuma página com esse nome." : "Nenhuma página guardada ainda."} />}
      {assuntos.map((a) => (
        <section key={a} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{a}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {visiveis.filter((p) => p.assunto === a).map((p) => (
              <Card key={p.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-semibold text-fg">{p.titulo}</h4>
                  <span className="shrink-0 text-xs text-slate-500">{dataBr(p.feita_em)}</span>
                </div>
                {p.descricao && <p className="text-sm text-slate-600">{p.descricao}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <a href={p.link} target="_blank" rel="noreferrer" className={`${CLASSE_BOTAO} bg-brand text-brand-fg shadow-sm hover:bg-brand-dark`}>
                    <ExternalLink size={16} /> Abrir página
                  </a>
                  <Button type="button" variant="secondary" onClick={() => copiar(p.link, "Link da página copiado")}>
                    <Copy size={16} /> Copiar link
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
