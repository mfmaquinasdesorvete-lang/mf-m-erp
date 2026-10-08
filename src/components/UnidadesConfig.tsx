// Configurações → Unidades: matriz SC e filial SP (CNPJ, IE e endereço). Os impostos da nota ficam em
// Notas fiscais → Configurações da NF-e.
import { useState, type FormEvent } from "react";
import { Building2, Pencil } from "lucide-react";
import { Badge, Button, Field, Modal } from "./ui";
import { useSave } from "@/lib/data";
import { docFormat } from "@/lib/format";
import { buscarCep } from "@/lib/cep";
import { buscarCnpj, inscricaoDoEstado, preencherVazios } from "@/lib/cnpj";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade, type Unidade } from "@/lib/unidade";

const NUMEROS = ["serie_nfe"] as const;

export function UnidadesConfig() {
  const { unidades } = useUnidade();
  const [editando, setEditando] = useState<Unidade | null>(null);
  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Building2 size={18} className="text-brand" /> Unidades (matriz e filial)</h2>
      <p className="mb-3 text-sm text-slate-600">
        Cada unidade emite NF-e com o próprio CNPJ e tem estoque e financeiro separados. Regime: <b>lucro real</b>.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {unidades.map((u) => {
          const pendente = !u.cnpj || !u.inscricao_estadual || !u.logradouro || !u.cep;
          return (
            <div key={u.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-fg">{u.nome} {u.matriz && <span className="text-xs font-semibold text-slate-500">· matriz</span>}</div>
                  <div className="text-sm text-slate-500">{u.cnpj ? docFormat(u.cnpj) : "CNPJ não informado"} · {[u.municipio, u.uf].filter(Boolean).join("/") || "—"}</div>
                </div>
                {pendente ? <Badge value="pendente" /> : <Badge value="ativo" />}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                ICMS interno {Number(u.icms_aliquota_interna)}% · PIS {Number(u.pis_aliquota)}% · COFINS {Number(u.cofins_aliquota)}% · {u.fabrica ? "fábrica" : "sem fábrica"} · {u.assistencia ? "assistência" : "sem assistência"}
              </div>
              {pendente && <div className="mt-1 text-xs font-semibold text-amber-700">Falta CNPJ, IE ou endereço para emitir NF-e.</div>}
              <Button type="button" variant="secondary" className="mt-3" onClick={() => setEditando({ ...u })}><Pencil size={15} /> Editar</Button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Na Focus NFe, cadastre as duas empresas (CNPJ, certificado A1 e numeração). CFOP, CST, alíquotas e IBS/CBS de cada unidade:
        <b> Notas fiscais → Configurações da NF-e</b>.
      </p>
      {editando && <UnidadeModal unidade={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function UnidadeModal({ unidade, onClose }: { unidade: Unidade; onClose: () => void }) {
  const [u, setU] = useState<Record<string, any>>(unidade);
  const save = useSave("unidades");
  const set = (k: string) => (e: { target: { value: string } }) => setU({ ...u, [k]: e.target.value });
  const chk = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!u[k]} onChange={(e) => setU({ ...u, [k]: e.target.checked })} /> {label}</label>
  );
  const campo = (k: string, label: string, cls = "", type = "text") => (
    <Field label={label} className={cls}><input className="input" type={type} step={type === "number" ? "any" : undefined} value={u[k] ?? ""} onChange={set(k)} /></Field>
  );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      const { created_at: _c, ...row } = u;
      for (const k of NUMEROS) row[k] = Number(row[k] || 0);
      row.uf = row.uf?.toUpperCase();
      await save.mutateAsync(row);
      notify(`${u.nome} salva`);
      onClose();
    } catch (err) { notifyError(err); }
  }

  return (
    <Modal open wide onClose={onClose} title={`Unidade: ${unidade.nome}`}>
      <form onSubmit={salvar}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {campo("nome", "Nome no ERP", "sm:col-span-2")}
            {campo("codigo", "Sigla")}
            {campo("serie_nfe", "Série da NF-e", "", "number")}
            {campo("razao_social", "Razão social", "sm:col-span-2")}
            <Field label="CNPJ (preenche o resto)"><input className="input" value={u.cnpj ?? ""} onChange={set("cnpj")}
              onBlur={async () => { const d = await buscarCnpj(u.cnpj); if (d) { setU((x) => ({ ...x, ...preencherVazios(x, { ...d, inscricao_estadual: inscricaoDoEstado(d) }, { inscricao_estadual: "inscricao_estadual",  razao_social: "nome", logradouro: "logradouro", numero: "numero", complemento: "complemento", bairro: "bairro", municipio: "municipio", uf: "uf", cep: "cep", telefone: "telefone", email: "email" }) })); notify("Dados preenchidos pela Receita Federal"); } }} /></Field>
            {campo("inscricao_estadual", "Inscrição estadual")}
            {campo("inscricao_municipal", "Inscrição municipal")}
            <Field label="CEP"><input className="input" value={u.cep ?? ""} onChange={set("cep")}
              onBlur={async () => { const r = await buscarCep(u.cep); if (r) setU((x) => ({ ...x, ...r })); }} /></Field>
            {campo("logradouro", "Logradouro", "sm:col-span-2")}
            {campo("numero", "Número")}
            {campo("complemento", "Complemento")}
            {campo("bairro", "Bairro")}
            {campo("municipio", "Município")}
            {campo("uf", "UF")}
            {campo("telefone", "Telefone")}
            {campo("whatsapp", "WhatsApp")}
            {campo("email", "E-mail", "sm:col-span-2")}
            <Field label="Dados para pagamento (Pix, banco, agência e conta) — vão nos lembretes e na cobrança pelo WhatsApp" className="sm:col-span-4">
              <textarea className="input" rows={2} placeholder={"Pix (CNPJ): 12.345.678/0001-90\nBanco do Brasil · Ag. 1234-5 · C/C 98765-4"} value={u.instrucoes_pagamento ?? ""} onChange={set("instrucoes_pagamento")} />
            </Field>
            <div className="flex flex-wrap gap-5 sm:col-span-4">{chk("fabrica", "Fabrica máquinas aqui")}{chk("assistencia", "Faz assistência técnica")}{chk("ativo", "Ativa")}</div>
            <p className="text-xs text-slate-500 sm:col-span-4">CFOP, CST, alíquotas e IBS/CBS desta unidade: Notas fiscais → Configurações da NF-e.</p>
          </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
