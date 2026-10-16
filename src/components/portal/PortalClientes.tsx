// Meus clientes: só a carteira do representante, com a última compra e o total comprado no ano (vendas dele).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, Search, UserPlus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { brl, dataBR, pl } from "@/lib/format";
import type { ClientePortal } from "@/lib/portal";
import { ClienteNovoModal } from "./ClienteNovo";
import { usePortal } from "./dados";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PortalClientes() {
  const { data: clientes = [], isLoading, error } = usePortal<ClientePortal[]>("portal_clientes");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"nome" | "total" | "recente">("nome");
  const [novo, setNovo] = useState(false);
  const navigate = useNavigate();
  const lista = useMemo(() => {
    const t = semAcento(busca.trim());
    const l = clientes.filter((c) => !t || semAcento(`${c.nome} ${c.nome_fantasia ?? ""} ${c.municipio ?? ""} ${c.uf ?? ""}`).includes(t));
    if (ordem === "total") return [...l].sort((a, b) => Number(b.total_ano) - Number(a.total_ano));
    if (ordem === "recente") return [...l].sort((a, b) => (b.ultima_compra ?? "").localeCompare(a.ultima_compra ?? ""));
    return l;
  }, [clientes, busca, ordem]);
  const totalAno = clientes.reduce((s, c) => s + Number(c.total_ano), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-fg">Meus clientes</h1>
          <p className="text-sm text-slate-600">{clientes.length} {pl(clientes.length, "cliente", "clientes")} · {brl(totalAno)} no ano</p>
        </div>
        <Button variant="secondary" onClick={() => setNovo(true)}><UserPlus size={16} aria-hidden /> Cliente novo</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" type="search" placeholder="Nome ou cidade" aria-label="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <select className="input w-auto" aria-label="Ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="nome">Nome</option><option value="total">Mais comprou no ano</option><option value="recente">Compra mais recente</option>
        </select>
      </div>
      {isLoading && <p className="py-8 text-center text-slate-500">Carregando…</p>}
      {error && <p className="py-8 text-center text-red-700" role="alert">{(error as Error).message}</p>}
      {!isLoading && !error && !lista.length && <p className="py-8 text-center text-sm text-slate-500">{clientes.length ? "Nenhum cliente com essa busca." : "Sua carteira ainda está vazia."}</p>}
      <ul className="space-y-2">
        {lista.map((c) => (
          <li key={c.id}>
            <Card className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{c.nome_fantasia && c.nome_fantasia !== c.nome ? `${c.nome_fantasia} (${c.nome})` : c.nome}</span>
                <span className="block text-xs text-slate-500">{[c.municipio, c.uf].filter(Boolean).join("/") || "—"}
                  {c.conferir && <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">em conferência</span>}</span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  Última compra: {c.ultima_compra ? dataBR(c.ultima_compra) : "—"} · no ano: <b className="num">{brl(c.total_ano)}</b>
                </span>
              </span>
              <Button variant="secondary" className="shrink-0 !px-3" aria-label={`Novo orçamento para ${c.nome}`} onClick={() => navigate(`/portal/novo?cliente=${c.id}`)}>
                <FilePlus2 size={16} aria-hidden /><span className="hidden sm:inline">Orçamento</span>
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      {novo && <ClienteNovoModal onClose={() => setNovo(false)} onCriado={(id) => { setNovo(false); navigate(`/portal/novo?cliente=${id}`); }} />}
      <p className="text-xs text-slate-500">Só aparecem os clientes da sua carteira. Para trazer um cliente que já tem cadastro na empresa, fale com a empresa.</p>
    </div>
  );
}
