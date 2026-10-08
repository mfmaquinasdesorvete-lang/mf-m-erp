import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ImportarContatos } from "@/components/ImportarContatos";
import { CrudPage, type CampoForm } from "@/components/CrudPage";
import { Contato, NomeCadastro } from "@/components/Contato";
import { Button, Tabs } from "@/components/ui";
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

export default function Fornecedores() {
  const { pode, papel } = usePerfil();
  const [importar, setImportar] = useState<"fornecedor" | "transportadora" | null>(null);
  const podeImportar = papel === "admin" || papel === "financeiro";
  const botaoImportar = (tipo: "fornecedor" | "transportadora") =>
    podeImportar && <Button variant="secondary" onClick={() => setImportar(tipo)}><FileSpreadsheet size={16} /> Importar</Button>;
  const [aba, setAba] = useState<"fornecedores" | "transportadoras">(pode("editar_fornecedores") ? "fornecedores" : "transportadoras");

  return (
    <div>
      {importar && <ImportarContatos tipo={importar} onClose={() => setImportar(null)} />}
      <Tabs value={aba} onChange={setAba} options={[
        { value: "fornecedores", label: "Fornecedores de peças" },
        { value: "transportadoras", label: "Transportadoras" },
      ]} />
      {aba === "fornecedores" ? (
        <CrudPage<Fornecedor>
          anexos="fornecedor"
          key="f"
          readOnly={!pode("editar_fornecedores")}
          extraActions={botaoImportar("fornecedor")}
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
            { name: "email", label: "E-mail", mask: "email", span: 4 },
            ...endereco,
            { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
          ]}
          columns={[
            ...colunas<Fornecedor>("Olá! Aqui é da MF Máquinas."),
            { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
          ]}
        />
      ) : (
        <CrudPage<Transportadora>
          key="t"
          readOnly={!pode("editar_transportadoras")}
          extraActions={botaoImportar("transportadora")}
          title="Transportadoras"
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
