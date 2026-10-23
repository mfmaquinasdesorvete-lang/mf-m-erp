// Cadastro rápido de cliente na hora da venda (PDV/balcão): nome e, se tiver, CPF/CNPJ (o CNPJ busca na Receita),
// WhatsApp, e-mail e endereço (o CEP completa). O resto do cadastro fica para depois, em Clientes.
import { useState, type FormEvent } from "react";
import { Search, UserPlus } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { digitos } from "@/lib/format";
import { erroCampo, mostrar, gravar } from "@/lib/mascaras";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import type { Cliente } from "@/lib/types";

type Dados = { nome: string; nome_fantasia?: string; cpf_cnpj: string; whatsapp: string; email: string; cep: string; logradouro: string; numero: string;
  bairro: string; municipio: string; uf: string; inscricao_estadual?: string; observacoes?: string };

export function ClienteRapido({ inicial, clientes, onClose, onCriado }: {
  inicial?: string; clientes: Cliente[]; onClose: () => void; onCriado: (c: Cliente) => void;
}) {
  const soNumeros = digitos(inicial ?? "");
  const ehDoc = !!inicial && soNumeros.length >= 11 && /^[\d.\-/\s]+$/.test(inicial);
  const [d, setD] = useState<Dados>({
    nome: ehDoc ? "" : (inicial ?? ""), cpf_cnpj: ehDoc ? soNumeros : "", whatsapp: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "",
  });
  const [buscando, setBuscando] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [endereco, setEndereco] = useState(false);
  const set = (k: keyof Dados, v: string) => setD((x) => ({ ...x, [k]: v }));

  async function buscarCnpj() {
    if (digitos(d.cpf_cnpj).length !== 14) return notify("Digite o CNPJ completo (14 números) para buscar na Receita", "erro");
    setBuscando("cnpj");
    try {
      const patch = await completarPorCnpj(d, d.cpf_cnpj, ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"], true);
      if (patch) { setD((x) => ({ ...x, ...patch, whatsapp: x.whatsapp || String((patch as any).telefone ?? "") })); setEndereco(true); }
    } finally { setBuscando(""); }
  }
  async function cep(v: string) {
    set("cep", gravar("cep", v));
    if (digitos(v).length !== 8) return;
    setBuscando("cep");
    try {
      const r = await completarPorCep(v);
      if (r) setD((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, municipio: r.municipio || x.municipio, uf: r.uf || x.uf }));
    } finally { setBuscando(""); }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const erro = [
      erroCampo("doc", d.cpf_cnpj), erroCampo("whatsapp", d.whatsapp), erroCampo("email", d.email), d.cep ? erroCampo("cep", d.cep) : null,
    ].find(Boolean);
    if (erro) return notify(erro, "erro");
    if (d.nome.trim().length < 2) return notify("Escreva o nome do cliente", "erro");
    const doc = digitos(d.cpf_cnpj);
    // mesmo CPF/CNPJ já cadastrado: usa o cadastro que existe
    const existe = doc ? clientes.find((c) => digitos(c.cpf_cnpj) === doc) : null;
    if (existe) { notify(`Já cadastrado: usando o cadastro de ${existe.nome}`); onCriado(existe); return; }
    setSalvando(true);
    const ie = (d.inscricao_estadual ?? "").trim();
    const row = {
      nome: d.nome.trim(), nome_fantasia: d.nome_fantasia?.trim() || null, cpf_cnpj: doc || null,
      tipo_pessoa: doc.length === 14 ? "PJ" : "PF",
      // pessoa física e empresa sem IE: não contribuinte (a NF-e sai como consumidor final)
      contribuinte_icms: doc.length === 14 && ie && ie.toUpperCase() !== "ISENTO" ? 1 : 9, inscricao_estadual: ie || null,
      whatsapp: digitos(d.whatsapp) || null, email: d.email.trim().toLowerCase() || null,
      cep: digitos(d.cep) || null, logradouro: d.logradouro.trim() || null, numero: d.numero.trim() || null, bairro: d.bairro.trim() || null,
      municipio: d.municipio.trim() || null, uf: d.uf.trim().toUpperCase() || null, observacoes: d.observacoes?.trim() || null,
    };
    const { data, error } = await supabase.from("clientes").insert(row).select().single();
    setSalvando(false);
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("Já existe um cliente com este CPF/CNPJ (pode estar arquivado): procure em Clientes") : error);
    notify(`Cliente ${row.nome} cadastrado`);
    onCriado(data as Cliente);
  }

  const doc = digitos(d.cpf_cnpj);
  return (
    <Modal open onClose={onClose} title="Cadastrar cliente na hora">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CPF ou CNPJ (opcional)">
            <div className="relative">
              <input className="input pr-10" inputMode="numeric" value={mostrar("doc", d.cpf_cnpj)} autoFocus={ehDoc || !inicial}
                onChange={(e) => set("cpf_cnpj", gravar("doc", e.target.value))} placeholder="000.000.000-00" />
              {doc.length === 14 && (
                <button type="button" onClick={(e) => { e.preventDefault(); buscarCnpj(); }} title="Buscar o CNPJ na Receita" aria-label="Buscar o CNPJ na Receita"
                  className="botao-icone absolute right-1.5 top-1/2 -translate-y-1/2">
                  <Search size={16} className={buscando === "cnpj" ? "animate-pulse" : ""} />
                </button>
              )}
            </div>
          </Field>
          <Field label="Nome *"><input className="input" value={d.nome} onChange={(e) => set("nome", e.target.value)} required minLength={2} autoFocus={!!inicial && !ehDoc} /></Field>
          <Field label="WhatsApp"><input className="input" inputMode="tel" value={mostrar("whatsapp", d.whatsapp)} onChange={(e) => set("whatsapp", gravar("whatsapp", e.target.value))} placeholder="(48) 99999-9999" /></Field>
          <Field label="E-mail"><input className="input" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
        {!endereco ? (
          <button type="button" onClick={(e) => { e.preventDefault(); setEndereco(true); }} className="link-acao text-sm">+ Endereço (precisa para emitir NF-e)</button>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="CEP"><input className="input" inputMode="numeric" value={mostrar("cep", d.cep)} onChange={(e) => cep(e.target.value)} placeholder={buscando === "cep" ? "buscando…" : "00000-000"} /></Field>
            <Field label="Rua" className="sm:col-span-3"><input className="input" value={d.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></Field>
            <Field label="Número"><input className="input" value={d.numero} onChange={(e) => set("numero", e.target.value)} /></Field>
            <Field label="Bairro"><input className="input" value={d.bairro} onChange={(e) => set("bairro", e.target.value)} /></Field>
            <Field label="Cidade"><input className="input" value={d.municipio} onChange={(e) => set("municipio", e.target.value)} /></Field>
            <Field label="UF"><input className="input" maxLength={2} value={d.uf} onChange={(e) => set("uf", e.target.value.toUpperCase())} /></Field>
          </div>
        )}
        <p className="text-xs text-slate-500">O resto do cadastro (crédito, tabela de preço, segundo endereço…) fica para depois, em Cadastros → Clientes.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}><UserPlus size={16} /> {salvando ? "Cadastrando…" : "Cadastrar e usar na venda"}</Button>
        </div>
      </form>
    </Modal>
  );
}
