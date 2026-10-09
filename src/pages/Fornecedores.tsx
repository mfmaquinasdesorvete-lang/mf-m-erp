import { useState } from "react";
import { Building2, FileSpreadsheet, Wrench } from "lucide-react";
import { ImportarContatos } from "@/components/ImportarContatos";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { supabase } from "@/lib/supabase";
import { Contato, NomeCadastro } from "@/components/Contato";
import { Button, Modal } from "@/components/ui";
import { ArrumarFornecedores, EtiquetasCliente, ReceitaCadastro } from "@/components/clientes/QualidadeClientes";
import { digitos, docFormat } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import type { Fornecedor, Transportadora } from "@/lib/types";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import { notify } from "@/lib/notify";

const CAMPOS_RECEITA = ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"];

/** CNPJ completo preenche nome, IE, contato e endereço; CEP preenche o endereço. */
const busca = async (name: string, value: any, row: Record<string, any>, forcar?: boolean) => {
  if (name === "cep" && (forcar || digitos(value).length === 8)) return completarPorCep(value, forcar);
  if (name !== "cnpj") return null;
  if (digitos(value).length === 14) return completarPorCnpj(row, value, CAMPOS_RECEITA, forcar);
  if (forcar) notify("Digite o CNPJ completo (14 números) para buscar na Receita", "erro");
  return null;
};

const identificacao = (ajudaNome: string): CampoForm[] => [
  { name: "codigo", label: "Código", type: "readonly", span: 1 },
  { name: "cnpj", label: "CNPJ (preenche o resto)", mask: "cnpj", buscar: true, span: 3 },
  { name: "nome_fantasia", label: ajudaNome },
  { name: "nome", label: "Razão social", required: true },
  { name: "inscricao_estadual", label: "Inscrição estadual (vem pelo CNPJ)", mask: "ie" },
];

const endereco: CampoForm[] = [
  { name: "e", label: "Endereço", type: "secao" },
  { name: "cep", label: "CEP", mask: "cep", buscar: true, span: 1 },
  { name: "logradouro", label: "Logradouro", span: 3 },
  { name: "numero", label: "Número", span: 1 },
  { name: "complemento", label: "Complemento", span: 1 },
  { name: "bairro", label: "Bairro" },
  { name: "municipio", label: "Município", span: 3 },
  { name: "uf", label: "UF", mask: "uf", span: 1 },
];

const colunas = <T extends { codigo?: number | null; nome: string; nome_fantasia?: string | null; cnpj?: string | null; municipio?: string | null; uf?: string | null }>(msg: string) => [
  { label: "Cód.", render: (r: T) => <span className="font-mono text-xs text-slate-500">{r.codigo ?? "—"}</span>, className: "w-14" },
  { label: "Nome", render: (r: T) => <NomeCadastro r={r} /> },
  { label: "CNPJ", render: (r: T) => <span className="whitespace-nowrap">{docFormat(r.cnpj) || "—"}</span> },
  { label: "Contato", render: (r: T) => <Contato r={r as any} mensagem={msg} /> },
];

const tag = (r: Fornecedor, t: string) => (r.tags ?? []).includes(t);
const FILTROS_FORN: FiltroCrud<Fornecedor>[] = [
  ...filtrosLocal<Fornecedor>(),
  filtroCompletude<Fornecedor>((r) => r.cnpj),
  {
    label: "Receita", opcoes: [
      { label: "CNPJ baixado/inapto", teste: (r) => tag(r, "cnpj_irregular") },
      { label: "IE baixada", teste: (r) => tag(r, "ie_baixada") },
      { label: "Endereço diferente da Receita (2 endereços)", teste: (r) => tag(r, "endereco_receita") },
      { label: "CNPJ ainda não conferido", teste: (r) => digitos(r.cnpj).length === 14 && !r.receita_em },
      { label: "CNPJ ativo e conferido", teste: (r) => !!r.receita_em && r.receita_situacao === "ATIVA" },
    ],
  },
  { label: "WhatsApp", opcoes: [{ label: "Sem WhatsApp", teste: (r) => !r.whatsapp }, { label: "Com WhatsApp", teste: (r) => !!r.whatsapp }] },
  filtroCadastradoEm<Fornecedor>(),
];
const ORDENS_FORN = ordensCadastro<Fornecedor>();
const FILTROS_TRANSP: FiltroCrud<Transportadora>[] = [
  ...filtrosLocal<Transportadora>(),
  { label: "Situação", opcoes: [{ label: "Ativas", teste: (r) => r.ativo !== false }, { label: "Inativas", teste: (r) => r.ativo === false }] },
  filtroCompletude<Transportadora>((r) => r.cnpj),
  filtroCadastradoEm<Transportadora>(),
];
const ORDENS_TRANSP = ordensCadastro<Transportadora>();

/** Ativa/inativa várias transportadoras de uma vez. */
async function situacaoTransportadoras(ids: string[], ativo: boolean) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("transportadoras").update({ ativo }).in("id", ids.slice(i, i + 200));
    if (error) throw error;
  }
  return `${ids.length} transportadora(s) ${ativo ? "ativada(s)" : "inativada(s)"}`;
}

/** Fornecedores e transportadoras: cada um no seu item do menu (mesma permissão de tela). */
export default function Fornecedores({ tipo: aba }: { tipo: "fornecedores" | "transportadoras" }) {
  const { pode, papel } = usePerfil();
  const [importar, setImportar] = useState<"fornecedor" | "transportadora" | null>(null);
  const [arrumar, setArrumar] = useState(false);
  const [receita, setReceita] = useState<Fornecedor | null>(null);
  const podeImportar = papel === "admin" || papel === "financeiro";
  const botaoImportar = (tipo: "fornecedor" | "transportadora") =>
    podeImportar && <Button variant="secondary" onClick={() => setImportar(tipo)}><FileSpreadsheet size={16} /> Importar</Button>;

  return (
    <div>
      {importar && <ImportarContatos tipo={importar} onClose={() => setImportar(null)} />}
      {arrumar && <ArrumarFornecedores onClose={() => setArrumar(false)} />}
      {receita && (
        <Modal open onClose={() => setReceita(null)} title={`Receita · ${receita.nome_fantasia || receita.nome}`}>
          <ReceitaCadastro registro={receita as any} tabela="fornecedores" />
        </Modal>
      )}
      {aba === "fornecedores" ? (
        <CrudPage<Fornecedor>
          anexos="fornecedor"
          key="f"
          readOnly={!pode("editar_fornecedores")}
          extraActions={<>
            {pode("editar_fornecedores") && <Button variant="secondary" onClick={() => setArrumar(true)}><Wrench size={16} /> Arrumar cadastro</Button>}
            {botaoImportar("fornecedor")}
          </>}
          rowActions={(r) => digitos(r.cnpj).length === 14 && (
            <button type="button" onClick={() => setReceita(r)}
              title={r.receita_em ? "O que a Receita diz deste fornecedor (e os dois endereços, se forem diferentes)" : "Conferir este CNPJ na Receita agora"}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-semibold transition ${r.receita_em
                ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-sm hover:brightness-110"
                : "border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
              <Building2 size={15} /> Receita
            </button>
          )}
          filtros={FILTROS_FORN}
          ordens={ORDENS_FORN}
          podeExcluir={papel === "admin"}
          plural="fornecedores"
          title="Fornecedores"
          table="fornecedores"
          order="nome"
          defaults={{ nome: "" }}
          searchKeys={["codigo", "nome", "nome_fantasia", "cnpj", "whatsapp", "telefone", "email", "municipio"]}
          beforeSave={(r) => ({ ...r, uf: r.uf?.toUpperCase() })}
          onFieldChange={busca}
          fields={[
            ...identificacao("Nome (fantasia / como chamamos)"),
            { name: "c", label: "Contato", type: "secao" },
            { name: "whatsapp", label: "WhatsApp (pedidos e cotações)", mask: "whatsapp" },
            { name: "telefone", label: "Telefone", mask: "telefone" },
            { name: "email", label: "E-mail", mask: "email", span: 2 },
            { name: "chave_pix", label: "Chave Pix (para pagar)", placeholder: "CPF/CNPJ, e-mail, celular ou chave aleatória", span: 2 },
            ...endereco,
            { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
          ]}
          columns={[
            ...colunas<Fornecedor>("Olá! Aqui é da MF Máquinas.").map((c) => c.label === "Nome"
              ? { ...c, render: (r: Fornecedor) => <><NomeCadastro r={r} /><EtiquetasCliente c={r} /></> } : c),
            { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
          ]}
        />
      ) : (
        <CrudPage<Transportadora>
          key="t"
          readOnly={!pode("editar_transportadoras")}
          extraActions={botaoImportar("transportadora")}
          filtros={FILTROS_TRANSP}
          ordens={ORDENS_TRANSP}
          podeExcluir={papel === "admin"}
          plural="transportadoras"
          acoesLote={pode("editar_transportadoras") ? [
            { label: "Inativar", executar: (ids) => situacaoTransportadoras(ids, false) },
            { label: "Ativar", executar: (ids) => situacaoTransportadoras(ids, true) },
          ] : []}
          title="Lista completa"
          table="transportadoras"
          order="nome"
          defaults={{ nome: "", ativo: true }}
          searchKeys={["codigo", "nome", "nome_fantasia", "cnpj", "regioes", "whatsapp"]}
          beforeSave={(r) => ({ ...r, uf: r.uf?.toUpperCase() })}
          onFieldChange={busca}
          fields={[
            ...identificacao("Nome (como aparece no frete)"),
            { name: "ativo", label: "Ativa", type: "checkbox" },
            { name: "c", label: "Contato", type: "secao" },
            { name: "contato", label: "Pessoa de contato" },
            { name: "whatsapp", label: "WhatsApp (para pedir cotação)", mask: "whatsapp" },
            { name: "telefone", label: "Telefone", mask: "telefone" },
            { name: "email", label: "E-mail", mask: "email" },
            { name: "regioes", label: "Regiões que atende (ex.: SP, MG, GO)", span: 4 },
            ...endereco,
            { name: "observacoes", label: "Observações (prazos, coleta, seguro…)", type: "textarea", span: 4 },
          ]}
          columns={[
            ...colunas<Transportadora>("Olá! Aqui é da MF Máquinas, gostaria de uma cotação de frete."),
            { label: "Atende", render: (r) => r.regioes ?? "—" },
            { label: "Situação", render: (r) => (r.ativo ? "ativa" : "inativa") },
          ]}
        />
      )}
    </div>
  );
}
