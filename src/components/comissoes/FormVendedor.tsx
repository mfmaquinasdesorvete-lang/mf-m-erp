// Cadastro completo do vendedor ou representante (como no Tiny, e melhor): dados, endereço pelo CEP, contato, unidade,
// comissionamento (quando sai, parte na aprovação e o resto no recebimento, linhas de produto) e pagamento (Pix e
// NF do terceirizado).
import { useState, type FormEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { buscarCep } from "@/lib/cep";
import { useUnidade } from "@/lib/unidade";
import { ajusteTexto, type TabelaPreco } from "@/lib/tabelasPreco";
import type { Vendedor } from "@/lib/types";

type Usuario = { user_id: string; nome: string; papel: string };
/** Quando a comissão sai: as duas bases do banco e a liberação parcial (recebimento + % na aprovação) */
export type QuandoComissao = "recebimento" | "faturamento" | "misto";

export const quandoDe = (v: Partial<Vendedor>): QuandoComissao =>
  v.base === "faturamento" ? "faturamento" : Number(v.liberacao_faturamento_pct) > 0 ? "misto" : "recebimento";

/** "no recebimento", "no faturamento" ou "50% na aprovação e o resto no recebimento" */
export function textoQuando(v: Partial<Vendedor>) {
  const q = quandoDe(v);
  if (q === "faturamento") return "no faturamento";
  if (q === "misto") return `${Number(v.liberacao_faturamento_pct).toLocaleString("pt-BR")}% na aprovação e o resto no recebimento`;
  return "no recebimento";
}

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:col-span-4 sm:grid-cols-4">
      <legend className="pr-2 text-sm font-bold text-fg">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function FormVendedor({ inicial, usuarios, tabelas, onClose }: {
  inicial: Partial<Vendedor>; usuarios: Usuario[]; tabelas: TabelaPreco[]; onClose: () => void;
}) {
  const { unidades } = useUnidade();
  const [v, setV] = useState<Partial<Vendedor>>(inicial);
  const [quando, setQuando] = useState<QuandoComissao>(quandoDe(inicial));
  const [cepBuscando, setCepBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const set = (k: keyof Vendedor) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const marca = (k: keyof Vendedor) => (e: { target: { checked: boolean } }) => setV((x) => ({ ...x, [k]: e.target.checked }));

  async function completarCep() {
    setCepBuscando(true);
    const r = await buscarCep(v.cep ?? "");
    setCepBuscando(false);
    if (!r) return notify("CEP não encontrado", "erro");
    setV((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, municipio: r.municipio || x.municipio, uf: r.uf || x.uf }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const num = (x: unknown) => Number(String(x ?? 0).replace(",", "."));
    const liberacao = quando === "misto" ? num(v.liberacao_faturamento_pct ?? 50) : null;
    if (liberacao != null && !(liberacao > 0 && liberacao < 100)) return notify("A parte na aprovação vai de 1% a 99%", "erro");
    const txt = (x: string | null | undefined) => (x ?? "").trim() || null;
    const row = {
      nome: v.nome?.trim(), nome_fantasia: txt(v.nome_fantasia), codigo: txt(v.codigo), tipo: v.tipo ?? "vendedor",
      tipo_pessoa: v.tipo_pessoa || null, cpf_cnpj: txt(v.cpf_cnpj), contribuinte: v.contribuinte || null,
      cep: txt(v.cep), logradouro: txt(v.logradouro), numero: txt(v.numero), complemento: txt(v.complemento), bairro: txt(v.bairro),
      municipio: txt(v.municipio), uf: v.uf || null, telefone: txt(v.telefone), whatsapp: txt(v.whatsapp), email: txt(v.email),
      unidade_id: v.unidade_id || null, ativo: v.ativo ?? true, observacoes: txt(v.observacoes),
      user_id: v.user_id || null, portal_tabela_preco_id: v.portal_tabela_preco_id || null,
      percentual: num(v.percentual), base: quando === "faturamento" ? "faturamento" : "recebimento", liberacao_faturamento_pct: liberacao,
      descontar_frete: v.descontar_frete ?? true, ignorar_linhas: !!v.ignorar_linhas,
      pix: txt(v.pix), terceirizado: !!v.terceirizado, exige_nf: !!v.exige_nf,
    };
    setSalvando(true);
    const { error } = v.id ? await supabase.from("vendedores").update(row).eq("id", v.id) : await supabase.from("vendedores").insert(row);
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Salvo");
    invalidar("vendedores");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={v.id ? "Editar vendedor" : "Novo vendedor ou representante"}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={v.nome ?? ""} onChange={set("nome")} required /></Field>
        <Field label="Fantasia"><input className="input" value={v.nome_fantasia ?? ""} onChange={set("nome_fantasia")} /></Field>
        <Field label="Código"><input className="input" value={v.codigo ?? ""} onChange={set("codigo")} /></Field>
        <Field label="Tipo"><select className="input" value={v.tipo} onChange={set("tipo")}><option value="vendedor">Vendedor</option><option value="representante">Representante</option></select></Field>
        <Field label="Tipo de pessoa">
          <select className="input" value={v.tipo_pessoa ?? ""} onChange={set("tipo_pessoa")}><option value="">—</option><option value="fisica">Física</option><option value="juridica">Jurídica</option></select>
        </Field>
        <Field label={v.tipo_pessoa === "fisica" ? "CPF" : v.tipo_pessoa === "juridica" ? "CNPJ" : "CPF/CNPJ"}><input className="input" inputMode="numeric" value={v.cpf_cnpj ?? ""} onChange={set("cpf_cnpj")} /></Field>
        <Field label="Contribuinte (ICMS)">
          <select className="input" value={v.contribuinte ?? ""} onChange={set("contribuinte")}>
            <option value="">Não informado</option><option value="contribuinte">Contribuinte</option><option value="isento">Isento</option><option value="nao_contribuinte">Não contribuinte</option>
          </select>
        </Field>

        <Secao titulo="Endereço">
          <Field label="CEP">
            <div className="flex gap-1.5">
              <input className="input" inputMode="numeric" value={v.cep ?? ""} onChange={set("cep")} onBlur={() => { if ((v.cep ?? "").replace(/\D/g, "").length === 8 && !v.logradouro) completarCep(); }} />
              <Button type="button" variant="secondary" onClick={completarCep} disabled={cepBuscando} title="Buscar o endereço pelo CEP" aria-label="Buscar o endereço pelo CEP"><Search size={15} aria-hidden /></Button>
            </div>
          </Field>
          <Field label="Endereço" className="sm:col-span-3"><input className="input" value={v.logradouro ?? ""} onChange={set("logradouro")} /></Field>
          <Field label="Número"><input className="input" value={v.numero ?? ""} onChange={set("numero")} /></Field>
          <Field label="Complemento"><input className="input" value={v.complemento ?? ""} onChange={set("complemento")} /></Field>
          <Field label="Bairro" className="sm:col-span-2"><input className="input" value={v.bairro ?? ""} onChange={set("bairro")} /></Field>
          <Field label="Cidade" className="sm:col-span-3"><input className="input" value={v.municipio ?? ""} onChange={set("municipio")} /></Field>
          <Field label="UF"><select className="input" value={v.uf ?? ""} onChange={set("uf")}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        </Secao>

        <Secao titulo="Contato e situação">
          <Field label="Telefone"><input className="input" inputMode="tel" value={v.telefone ?? ""} onChange={set("telefone")} /></Field>
          <Field label="Celular / WhatsApp"><input className="input" inputMode="tel" value={v.whatsapp ?? ""} onChange={set("whatsapp")} /></Field>
          <Field label="E-mail" className="sm:col-span-2"><input className="input" type="email" value={v.email ?? ""} onChange={set("email")} /></Field>
          <Field label="Unidade (depósito)" className="sm:col-span-2">
            <select className="input" value={v.unidade_id ?? ""} onChange={set("unidade_id")}>
              <option value="">Todas</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={v.ativo ?? true} onChange={marca("ativo")} /> Ativo</label>
        </Secao>

        <Secao titulo="Comissionamento">
          <Field label="Comissão (%)"><input className="input" inputMode="decimal" value={v.percentual ?? ""} onChange={set("percentual")} required /></Field>
          <Field label="Liberação da comissão" className="sm:col-span-3">
            <select className="input" value={quando} onChange={(e) => setQuando(e.target.value as QuandoComissao)}>
              <option value="recebimento">Quando o cliente paga (parcela a parcela)</option>
              <option value="faturamento">Toda quando o pedido é aprovado</option>
              <option value="misto">Uma parte na aprovação e o restante no pagamento das parcelas</option>
            </select>
          </Field>
          {quando === "misto" && (
            <Field label="Parte liberada na aprovação (%)">
              <input className="input" inputMode="decimal" value={v.liberacao_faturamento_pct ?? 50} onChange={set("liberacao_faturamento_pct")} required />
            </Field>
          )}
          {quando === "misto" && <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-3">Ex.: 50% → metade sai quando o pedido é aprovado e a outra metade conforme cada parcela é paga.</p>}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={v.descontar_frete ?? true} onChange={marca("descontar_frete")} /> Não pagar comissão sobre o frete</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2" title="Vale sempre o % deste vendedor (e as regras dele por categoria), sem o % das linhas de produto">
            <input type="checkbox" className="h-5 w-5" checked={!!v.ignorar_linhas} onChange={marca("ignorar_linhas")} /> Desconsiderar o comissionamento por linhas de produto
          </label>
        </Secao>

        <Secao titulo="Pagamento da comissão">
          <Field label="Chave Pix" className="sm:col-span-2"><input className="input" value={v.pix ?? ""} onChange={set("pix")} placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória" /></Field>
          <div className="space-y-1.5 self-end pb-1 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!v.terceirizado} onChange={(e) => setV((x) => ({ ...x, terceirizado: e.target.checked, exige_nf: e.target.checked ? true : x.exige_nf }))} /> Terceirizado (não é funcionário)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!v.exige_nf} onChange={marca("exige_nf")} /> Pagar só com a NF dele</label>
          </div>
          {v.exige_nf && <p className="text-xs text-slate-500 sm:col-span-4">A conta a pagar da comissão vem com a chave Pix e só é paga com o nº da NF dele no documento. No pagamento em lote ela fica de fora até ter a NF.</p>}
        </Secao>

        <Secao titulo="Acesso">
          <Field label="Login no ERP (vê as próprias comissões)" className="sm:col-span-2">
            <select className="input" value={v.user_id ?? ""} onChange={set("user_id")}>
              <option value="">—</option>{usuarios.map((u) => <option key={u.user_id} value={u.user_id}>{u.nome}</option>)}
            </select>
          </Field>
          <Field label="Tabela de preço no portal (representante)" className="sm:col-span-2">
            <select className="input" value={v.portal_tabela_preco_id ?? ""} onChange={set("portal_tabela_preco_id")}>
              <option value="">Preço de venda</option>
              {tabelas.filter((t) => t.ativo || t.id === v.portal_tabela_preco_id).map((t) => <option key={t.id} value={t.id}>{t.nome} ({ajusteTexto(t.ajuste_percentual)})</option>)}
            </select>
          </Field>
        </Secao>

        <Field label="Observações" className="sm:col-span-4"><textarea className="input" rows={2} value={v.observacoes ?? ""} onChange={set("observacoes")} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
