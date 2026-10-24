// Acompanhamento de compras (pedido de 24/10): uma linha por peça pedida e as etapas lado a lado, para ver de uma vez
// onde cada uma está — ordem de compra ao fornecedor → nota emitida → transporte (CT-e ou nota "a caminho") → chegou.
// Os cartões de cima filtram a lista; tocar na linha abre a OC em Compras.
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, FileText, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { PageHeader, Stat, Table } from "@/components/ui";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { normalizar } from "@/lib/buscaCliente";
import { atrasada, ETAPAS, etapaDaPeca, ocorrenciaEntregue, previsaoDaPeca, type Etapa, type PecaCompra } from "@/lib/acompanhamentoCompras";

type Filtro = "abertas" | "atrasadas" | Etapa;

/** Marca da etapa na célula: feita (verde), a de agora (âmbar ou vermelha se atrasada) ou ainda não (cinza). */
function Passo({ estado, children }: { estado: "feito" | "agora" | "atraso" | "falta"; children: ReactNode }) {
  const Icone = estado === "feito" ? CheckCircle2 : estado === "atraso" ? AlertTriangle : Circle;
  const cor = estado === "feito" ? "text-emerald-600" : estado === "atraso" ? "text-red-600" : estado === "agora" ? "text-amber-500" : "text-slate-300";
  return (
    <div className="flex items-start gap-1.5">
      <Icone size={15} className={`mt-0.5 shrink-0 ${cor} ${estado === "agora" ? "fill-amber-100" : ""}`} aria-hidden />
      <div className={`min-w-0 text-sm leading-snug ${estado === "falta" ? "text-slate-400" : "text-fg"}`}>{children}</div>
    </div>
  );
}

export default function AcompanhamentoCompras() {
  const navigate = useNavigate();
  const { filtrar } = useUnidade();
  const dia = hoje();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["pedidos_compra", "acompanhamento"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("acompanhamento_compras", { p_dias: 30 });
      if (error) throw error;
      return (data ?? []) as PecaCompra[];
    },
  });
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [busca, setBusca] = useState("");

  const pecas = useMemo(() => filtrar(data).map((p) => ({ p, etapa: etapaDaPeca(p), atraso: atrasada(p, dia) })), [data, filtrar, dia]);
  const conta = (f: Filtro) => pecas.filter((x) => passa(x, f)).length;
  const termo = normalizar(busca);
  const lista = pecas.filter((x) => passa(x, filtro) && (!termo || normalizar(
    [x.p.descricao, x.p.sku, x.p.fornecedor, `#${x.p.oc_numero}`, x.p.transportadora, ...x.p.notas.map((n) => `nf ${n.numero}`)].join(" ")).includes(termo)));

  function passa(x: { etapa: Etapa; atraso: boolean }, f: Filtro) {
    if (f === "abertas") return x.etapa !== "chegou" && x.etapa !== "cancelada";
    if (f === "atrasadas") return x.atraso;
    return x.etapa === f;
  }
  const cartao = (f: Filtro) => ({ onClick: () => setFiltro(filtro === f && f !== "abertas" ? "abertas" : f) });

  return (
    <div>
      <PageHeader title="Acompanhamento de compras" subtitle="Cada peça pedida: ordem de compra, nota do fornecedor, transporte e chegada" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={ClipboardList} tom={filtro === "cotacao" ? "info" : "neutro"} label="Em cotação" valor={conta("cotacao")} sub="falta confirmar com o fornecedor" {...cartao("cotacao")} />
        <Stat icon={ShoppingBag} tom={filtro === "pedida" ? "info" : "neutro"} label="Pedidas, sem nota" valor={conta("pedida")} sub="o fornecedor ainda não emitiu" {...cartao("pedida")} />
        <Stat icon={FileText} tom={filtro === "nota" ? "info" : "neutro"} label="Nota emitida" valor={conta("nota")} sub="esperando a transportadora" {...cartao("nota")} />
        <Stat icon={Truck} tom={filtro === "transporte" ? "info" : "neutro"} label="Em transporte" valor={conta("transporte")} sub="está vindo" {...cartao("transporte")} />
        <Stat icon={AlertTriangle} tom={conta("atrasadas") ? "critico" : "neutro"} label="Atrasadas" valor={conta("atrasadas")} sub="passou da previsão" {...cartao("atrasadas")} />
        <Stat icon={PackageCheck} tom={filtro === "chegou" ? "bom" : "neutro"} label="Chegaram" valor={conta("chegou")} sub="nos últimos 30 dias" {...cartao("chegou")} />
      </div>

      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar peça, código, fornecedor, OC ou NF…"
        direita={<span className="text-sm text-slate-600">
          {filtro === "abertas" ? "Peças ainda não chegaram" : filtro === "atrasadas" ? "Atrasadas" : ETAPAS.find((e) => e.valor === filtro)?.rotulo}
          {filtro !== "abertas" && <button type="button" className="link-modulo ml-2" onClick={() => setFiltro("abertas")}>ver todas em aberto</button>}
        </span>} />

      {error ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Não deu para carregar: {(error as Error).message}</p> : (
        <Table empty={!isLoading && !lista.length} head={<>
          <th scope="col" className="th">Peça</th>
          <th scope="col" className="th">Ordem de compra</th>
          <th scope="col" className="th">Nota fiscal</th>
          <th scope="col" className="th">Transporte</th>
          <th scope="col" className="th">Chegada</th>
        </>}>
          {lista.map((x) => {
            const { p } = x;
            const prev = previsaoDaPeca(p);
            const cte = p.notas.find((n) => n.cte || n.ocorrencia);
            const chegada = p.notas.map((n) => n.chegou_em).filter(Boolean).sort().pop() ?? p.recebido_em;
            const abrir = () => navigate("/compras", { state: { aba: "compras", abrirOc: p.oc_id } });
            return (
              <tr key={p.item_id} tabIndex={0} className="cursor-pointer align-top hover:bg-slate-50 focus-visible:bg-slate-50" onClick={abrir}
                onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrir(); } }}>
                <td className="td">
                  <b className="text-fg [overflow-wrap:anywhere]">{p.descricao}</b>
                  <span className="block text-xs text-slate-500">
                    {[p.sku, `${Number(p.quantidade)} un.`, p.op_numero ? `OP #${p.op_numero}` : null, p.valor != null ? brl(p.valor) : null].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className="td">
                  <Passo estado={x.etapa === "cotacao" ? "agora" : x.etapa === "cancelada" ? "falta" : "feito"}>
                    OC #{p.oc_numero} · {p.fornecedor ?? "sem fornecedor"}
                    <span className="block text-xs text-slate-500">
                      {x.etapa === "cancelada" ? "cancelada" : p.oc_status === "cotacao" ? `em cotação desde ${dataBR(p.oc_data)}` : `pedida em ${dataBR((p.enviado_em ?? p.oc_data).slice(0, 10))}`}
                    </span>
                  </Passo>
                </td>
                <td className="td">
                  <Passo estado={p.notas.length || x.etapa === "chegou" ? "feito" : x.etapa === "pedida" ? (x.atraso ? "atraso" : "agora") : "falta"}>
                    {p.notas.length ? p.notas.map((n) => `NF ${n.numero}`).join(", ") : x.etapa === "chegou" ? "sem nota ligada" : "aguardando nota"}
                    {p.notas[0]?.emissao && <span className="block text-xs text-slate-500">emitida em {dataBR(p.notas[0].emissao.slice(0, 10))}</span>}
                    {!p.notas.length && p.notas_soltas > 0 && (
                      <span className="block text-xs font-semibold text-amber-700">
                        {p.notas_soltas} {pl(p.notas_soltas, "nota", "notas")} do fornecedor sem OC: ligue na OC
                      </span>
                    )}
                  </Passo>
                </td>
                <td className="td">
                  <Passo estado={x.etapa === "chegou" ? "feito" : x.etapa === "transporte" || x.etapa === "nota" ? (x.atraso ? "atraso" : "agora") : "falta"}>
                    {cte ? <>
                      {cte.cte_transportadora ?? p.transportadora ?? "Transportadora"}{cte.cte ? ` · CT-e ${cte.cte}` : ""}
                      {cte.ocorrencia && <span className={`block text-xs ${ocorrenciaEntregue(cte.ocorrencia) ? "text-emerald-700" : "text-slate-600"}`}>
                        {cte.ocorrencia}{cte.ocorrencia_em ? ` (${dataBR(cte.ocorrencia_em.slice(0, 10))})` : ""}
                      </span>}
                    </> : <>
                      {p.transportadora ?? (x.etapa === "cotacao" || x.etapa === "pedida" ? "—" : "sem CT-e ainda")}
                      {p.notas.some((n) => n.processamento === "a_caminho") && <span className="block text-xs text-slate-600">a caminho (sem rastreio)</span>}
                    </>}
                    {x.etapa !== "chegou" && x.etapa !== "cancelada" && prev && (
                      <span className={`block text-xs ${x.atraso ? "font-semibold text-red-600" : "text-slate-500"}`}>
                        {x.atraso ? "atrasada · previsão era " : "previsão "}{dataBR(prev.slice(0, 10))}
                      </span>
                    )}
                  </Passo>
                </td>
                <td className="td">
                  <Passo estado={x.etapa === "chegou" ? "feito" : "falta"}>
                    {x.etapa === "chegou" ? <>Chegou{chegada ? ` em ${dataBR(chegada.slice(0, 10))}` : ""}</> : x.etapa === "cancelada" ? "Cancelada" : "Ainda não"}
                    {Number(p.recebida) > 0 && Number(p.recebida) < Number(p.quantidade) && (
                      <span className="block text-xs text-amber-700">recebido {Number(p.recebida)} de {Number(p.quantidade)}</span>
                    )}
                  </Passo>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {isLoading && <p className="mt-3 text-sm text-slate-500">Carregando…</p>}
    </div>
  );
}
