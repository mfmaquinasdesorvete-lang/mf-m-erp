// Clientes (CRM), cupons e programa de fidelidade.
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl, digitos, whatsappLink } from "@/lib/format";
import { notify } from "@/lib/notify";
import { clientePorTel, novoId, segmentos, type ClienteCrm, type Cupom, type Estado } from "@/lib/sorveteria";

type Mudar = (f: (e: Estado) => Estado) => void;
const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : 0; };
const SUBS = [["clientes", "Clientes"], ["cupons", "Cupons"], ["fid", "Fidelidade"]] as const;

export function Clientes({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [sub, setSub] = useState<(typeof SUBS)[number][0]>("clientes");
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {SUBS.map(([id, r]) => (
          <button key={id} type="button" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${sub === id ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>{r}</button>
        ))}
      </div>
      {sub === "clientes" && <Lista estado={estado} mudar={mudar} />}
      {sub === "cupons" && <Cupons estado={estado} mudar={mudar} />}
      {sub === "fid" && <Fidelidade estado={estado} mudar={mudar} />}
    </div>
  );
}

function Lista({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [q, setQ] = useState(""), [seg, setSeg] = useState<"" | "vip" | "inativo" | "niver">("");
  const [edit, setEdit] = useState<Partial<ClienteCrm> | null>(null);
  const cnt = (k: "vip" | "inativo" | "niver") => estado.clientes.filter((c) => segmentos(c)[k]).length;
  const lista = estado.clientes.filter((c) => (!q || c.nome.toLowerCase().includes(q.toLowerCase()) || c.tel.includes(q)) && (!seg || segmentos(c)[seg]));
  const filtros: [typeof seg, string][] = [["", `Todos (${estado.clientes.length})`], ["vip", `⭐ VIP (${cnt("vip")})`], ["inativo", `😴 Sumidos 30d (${cnt("inativo")})`], ["niver", `🎂 Aniversário do mês (${cnt("niver")})`]];

  function salvar() {
    const t = digitos(edit?.tel), n = edit?.nome?.trim();
    if (!n || t.length < 10) return notify("Informe o nome e o WhatsApp com DDD.", "erro");
    if (!edit?.id && clientePorTel(estado, t)) return notify("Já existe um cliente com esse telefone.", "erro");
    const c: ClienteCrm = { id: edit?.id ?? novoId(), nome: n, tel: t, end: edit?.end ?? "", bairro: edit?.bairro ?? "", ref: edit?.ref ?? "", nasc: edit?.nasc ?? "", pontos: edit?.pontos ?? 0, gasto: edit?.gasto ?? 0, pedidos: edit?.pedidos ?? 0, ultimo: edit?.ultimo ?? null, obs: edit?.obs ?? "" };
    mudar((e) => ({ ...e, clientes: edit?.id ? e.clientes.map((x) => (x.id === c.id ? c : x)) : [...e.clientes, c] }));
    setEdit(null);
  }
  const mensagem = (c: ClienteCrm) => {
    const s = segmentos(c), loja = estado.loja.nome;
    if (s.niver) return `Parabéns, ${c.nome}! 🎂 Passe na ${loja} e ganhe uma cobertura de presente.`;
    if (s.inativo) return `Oi, ${c.nome}! Sentimos sua falta na ${loja} 🍨 Volte e use o cupom ${estado.cupons.find((x) => x.ativo)?.cod ?? ""}.`;
    return `Oi, ${c.nome}! Aqui é da ${loja} 🍨`;
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-[12rem] flex-1" type="search" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="button" onClick={() => setEdit({})}><Plus size={16} aria-hidden /> Cliente</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {filtros.map(([k, r]) => (
          <button key={k} type="button" aria-pressed={seg === k} onClick={() => setSeg(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${seg === k ? "border-modulo bg-modulo text-white" : "border-slate-200"}`}>{r}</button>
        ))}
      </div>
      <Card className="divide-y divide-slate-100">
        {lista.map((c) => {
          const s = segmentos(c);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <b className="text-sm">{c.nome}</b>
                {s.vip && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-800">VIP</span>}
                {s.niver && <span className="ml-1.5 rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-900">🎂</span>}
                {s.inativo && <span className="ml-1.5 rounded-full bg-slate-100 px-2 text-xs font-bold">sumido</span>}
                <p className="text-xs text-slate-500">{c.tel} · {c.pedidos} pedido(s) · {brl(c.gasto)} · {c.pontos} pts{c.ultimo ? ` · último ${new Date(c.ultimo).toLocaleDateString("pt-BR")}` : ""}</p>
              </div>
              <a className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50" target="_blank" rel="noreferrer" href={whatsappLink(c.tel, mensagem(c))}>💬 WhatsApp</a>
              <Button type="button" variant="ghost" onClick={() => setEdit(c)}>Editar</Button>
            </div>
          );
        })}
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhum cliente. Eles entram sozinhos quando um pedido tem telefone.</p>}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar cliente" : "Novo cliente"}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nome"><input className="input" autoFocus value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp com DDD"><input className="input" inputMode="tel" value={edit.tel ?? ""} onChange={(e) => setEdit({ ...edit, tel: e.target.value })} /></Field>
              <Field label="Aniversário"><input className="input" type="date" value={edit.nasc ?? ""} onChange={(e) => setEdit({ ...edit, nasc: e.target.value })} /></Field>
            </div>
            <Field label="Endereço"><input className="input" value={edit.end ?? ""} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            <Field label="Observações (alergias, preferências)"><input className="input" value={edit.obs ?? ""} onChange={(e) => setEdit({ ...edit, obs: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="button" onClick={salvar}>Salvar</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Cupons({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [edit, setEdit] = useState<Partial<Cupom> | null>(null);
  function salvar() {
    const cod = (edit?.cod ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""), valor = edit?.valor ?? 0;
    if (!cod || !valor) return notify("Informe o código e o valor.", "erro");
    if (estado.cupons.some((c) => c.cod === cod)) return notify("Já existe um cupom com esse código.", "erro");
    mudar((e) => ({ ...e, cupons: [...e.cupons, { id: novoId(), cod, tipo: edit?.tipo ?? "%", valor, min: edit?.min ?? 0, validade: edit?.validade ?? "", limite: Math.floor(edit?.limite ?? 0), usos: 0, ativo: true }] }));
    setEdit(null);
  }
  return (
    <>
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-600">Cupons valem no PDV e no cardápio online.</p><Button type="button" onClick={() => setEdit({ tipo: "%" })}><Plus size={16} aria-hidden /> Cupom</Button></div>
      <Card className="divide-y divide-slate-100">
        {estado.cupons.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <b className="tracking-wider">{c.cod}</b>
            <span className="rounded-full bg-slate-100 px-2 text-xs font-bold">{c.tipo === "%" ? `${c.valor}%` : brl(c.valor)}</span>
            <span className="min-w-0 flex-1 text-xs text-slate-500">{c.min ? `a partir de ${brl(c.min)} · ` : ""}{c.validade ? `até ${new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · ` : ""}{c.usos} uso(s){c.limite ? ` de ${c.limite}` : ""}</span>
            <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={c.ativo} onChange={(e) => mudar((s) => ({ ...s, cupons: s.cupons.map((x) => (x.id === c.id ? { ...x, ativo: e.target.checked } : x)) }))} /> Ativo</label>
            <a className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50" target="_blank" rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`🍨 ${estado.loja.nome}: use o cupom ${c.cod} e ganhe ${c.tipo === "%" ? c.valor + "% de desconto" : brl(c.valor) + " de desconto"}${c.min ? " em pedidos acima de " + brl(c.min) : ""}!`)}`}>Divulgar</a>
          </div>
        ))}
        {estado.cupons.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum cupom.</p>}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Novo cupom">
        {edit && (
          <div className="space-y-3">
            <Field label="Código"><input className="input uppercase" autoFocus placeholder="Ex.: PRIMEIRA" value={edit.cod ?? ""} onChange={(e) => setEdit({ ...edit, cod: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo"><select className="input" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as "%" | "R$" })}><option value="%">% de desconto</option><option value="R$">R$ de desconto</option></select></Field>
              <Field label="Valor"><input className="input" inputMode="decimal" onChange={(e) => setEdit({ ...edit, valor: num(e.target.value) })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Pedido mínimo"><input className="input" inputMode="decimal" onChange={(e) => setEdit({ ...edit, min: num(e.target.value) })} /></Field>
              <Field label="Validade"><input className="input" type="date" onChange={(e) => setEdit({ ...edit, validade: e.target.value })} /></Field>
              <Field label="Limite de usos"><input className="input" inputMode="numeric" placeholder="0 = sem limite" onChange={(e) => setEdit({ ...edit, limite: num(e.target.value) })} /></Field>
            </div>
            <div className="flex justify-end"><Button type="button" onClick={salvar}>Salvar</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Fidelidade({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const f = estado.loja.fid;
  const set = (p: Partial<typeof f>) => mudar((e) => ({ ...e, loja: { ...e.loja, fid: { ...e.loja.fid, ...p } } }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.ativo} onChange={(e) => set({ ativo: e.target.checked })} /> Programa de fidelidade ativo</label>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Pontos por R$ 1"><input className="input" type="number" min={0} step={0.5} value={f.pts} onChange={(e) => set({ pts: Number(e.target.value) || 0 })} /></Field>
          <Field label="Pontos p/ resgatar"><input className="input" type="number" min={1} value={f.resgatePts} onChange={(e) => set({ resgatePts: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          <Field label="Vale desconto (R$)"><input className="input" type="number" min={1} value={f.resgateR} onChange={(e) => set({ resgateR: Math.max(1, Number(e.target.value) || 1) })} /></Field>
        </div>
        <p className="text-xs text-slate-500">A cada R$ 1 gasto o cliente ganha {f.pts} ponto(s); {f.resgatePts} pontos viram {brl(f.resgateR)} de desconto no PDV.</p>
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold">Mais pontos</h3>
        {[...estado.clientes].sort((a, b) => b.pontos - a.pontos).slice(0, 8).map((c) => <div key={c.id} className="flex justify-between py-0.5 text-sm"><span>{c.nome}</span><b>{c.pontos} pts</b></div>)}
        {estado.clientes.length === 0 && <p className="text-sm text-slate-500">Ainda sem clientes.</p>}
      </Card>
    </div>
  );
}
