import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { ImportarContatos } from "@/components/ImportarContatos";
import { Button } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { Contato, NomeCadastro } from "@/components/Contato";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import { notify } from "@/lib/notify";
import { digitos, docFormat } from "@/lib/format";
import type { Cliente } from "@/lib/types";

const CAMPOS_RECEITA = ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"];

const FIELDS: CampoForm[] = [
  { name: "codigo", label: "Código", type: "readonly", span: 1 },
  { name: "tipo_pessoa", label: "Tipo", type: "select", span: 1, options: [{ value: "PF", label: "Pessoa física" }, { value: "PJ", label: "Pessoa jurídica" }] },
  { name: "cpf_cnpj", label: "CPF / CNPJ (o CNPJ preenche o resto)", mask: "doc", buscar: true },
  { name: "nome_fantasia", label: "Nome (fantasia / como chamamos)", placeholder: "Ex.: Gelato Nobre" },
  { name: "nome", label: "Razão social (pessoa física: nome completo)", required: true },
  { name: "inscricao_estadual", label: "Inscrição estadual (vem pelo CNPJ)", mask: "ie" },
  {
    name: "contribuinte_icms", label: "Contribuinte ICMS", type: "select",
    options: [
      { value: 9, label: "Não contribuinte (consumidor final)" },
      { value: 1, label: "Contribuinte (tem IE)" },
      { value: 2, label: "Isento de inscrição" },
    ],
  },
  { name: "c", label: "Contato", type: "secao" },
  { name: "whatsapp", label: "WhatsApp", mask: "whatsapp" },
  { name: "telefone", label: "Telefone", mask: "telefone" },
  { name: "email", label: "E-mail", mask: "email", span: 3 },
  { name: "avisos_email", label: "Recebe avisos por e-mail", type: "checkbox", span: 1 },
  { name: "e", label: "Endereço", type: "secao" },
  { name: "cep", label: "CEP", mask: "cep", buscar: true, span: 1 },
  { name: "logradouro", label: "Logradouro", span: 3 },
  { name: "numero", label: "Número", span: 1 },
  { name: "complemento", label: "Complemento", span: 1 },
  { name: "bairro", label: "Bairro" },
  { name: "municipio", label: "Município", span: 3 },
  { name: "uf", label: "UF", mask: "uf", span: 1 },
  { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
];

const FILTROS: FiltroCrud<Cliente>[] = [
  ...filtrosLocal<Cliente>(),
  { label: "Tipo", opcoes: [{ label: "Pessoa jurídica", teste: (r) => r.tipo_pessoa === "PJ" }, { label: "Pessoa física", teste: (r) => r.tipo_pessoa === "PF" }] },
  filtroCompletude<Cliente>((r) => r.cpf_cnpj, [
    { label: "Contribuinte de ICMS (tem IE)", teste: (r) => Number(r.contribuinte_icms) === 1 },
    { label: "Não contribuinte", teste: (r) => Number(r.contribuinte_icms) === 9 },
  ]),
  filtroCadastradoEm<Cliente>(),
];
const ORDENS = ordensCadastro<Cliente>();

export default function Clientes() {
  const { papel } = usePerfil();
  const [importar, setImportar] = useState(false);
  // a importação em lote é do financeiro (e admin), como a de produtos
  const podeImportar = papel === "admin" || papel === "financeiro";
  return (
    <>
    {importar && <ImportarContatos tipo="cliente" onClose={() => setImportar(false)} />}
    <CrudPage<Cliente>
      filtros={FILTROS}
      ordens={ORDENS}
      podeExcluir={papel === "admin"}
      plural="clientes"
      extraActions={podeImportar && <Button variant="secondary" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar</Button>}
      anexos="cliente"
      title="Clientes"
      table="clientes"
      order="nome"
      defaults={{ tipo_pessoa: "PF", contribuinte_icms: 9, nome: "", avisos_email: true }}
      searchKeys={["codigo", "nome", "nome_fantasia", "cpf_cnpj", "whatsapp", "telefone", "email", "municipio"]}
      beforeSave={(r) => ({ ...r, contribuinte_icms: Number(r.contribuinte_icms), uf: r.uf?.toUpperCase() })}
      onFieldChange={async (name, value, row, forcar) => {
        if (name === "cep" && (forcar || digitos(value).length === 8)) return completarPorCep(value, forcar);
        if (name !== "cpf_cnpj") return null;
        const d = digitos(value);
        if (d.length === 11) return row.tipo_pessoa === "PF" ? null : { tipo_pessoa: "PF" };
        if (d.length === 14) {
          const p = await completarPorCnpj(row, d, CAMPOS_RECEITA, forcar);
          return { tipo_pessoa: "PJ", ...(p ?? {}), ...(p?.inscricao_estadual ? { contribuinte_icms: 1 } : {}) };
        }
        if (forcar) notify("Digite o CNPJ completo (14 números) para buscar na Receita", "erro");
        return null;
      }}
      fields={FIELDS}
      columns={[
        { label: "Cód.", render: (r) => <span className="font-mono text-xs text-slate-500">{r.codigo ?? "—"}</span>, className: "w-14" },
        { label: "Nome", render: (r) => <NomeCadastro r={r} /> },
        { label: "CPF/CNPJ", render: (r) => <span className="whitespace-nowrap">{docFormat(r.cpf_cnpj) || "—"}</span> },
        { label: "Contato", render: (r) => <Contato r={r} mensagem={`Olá, ${(r.nome_fantasia || r.nome).split(" ")[0]}! Aqui é da MF Máquinas.`} /> },
        { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
      ]}
    />
    </>
  );
}
