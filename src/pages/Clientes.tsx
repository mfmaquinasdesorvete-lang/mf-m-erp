import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, IdCard, Wrench } from "lucide-react";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { ImportarContatos } from "@/components/ImportarContatos";
import { FichaCliente } from "@/components/FichaCliente";
import { Button } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { Contato, NomeCadastro } from "@/components/Contato";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import { notify } from "@/lib/notify";
import { digitos, docFormat } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { ArrumarCadastro, EtiquetasCliente, UnificarClientes } from "@/components/clientes/QualidadeClientes";

const tag = (r: Cliente, t: string) => (r.tags ?? []).includes(t);
const temCnpj = (r: Cliente) => digitos(r.cpf_cnpj).length === 14;

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
  { name: "preferencias", label: "Preferências (como gosta de ser atendido, forma de pagamento, linhas que trabalha)", type: "textarea", span: 4 },
];

const FILTROS: FiltroCrud<Cliente>[] = [
  ...filtrosLocal<Cliente>(),
  { label: "Tipo", opcoes: [{ label: "Pessoa jurídica", teste: (r) => r.tipo_pessoa === "PJ" }, { label: "Pessoa física", teste: (r) => r.tipo_pessoa === "PF" }] },
  filtroCompletude<Cliente>((r) => r.cpf_cnpj, [
    { label: "Contribuinte de ICMS (tem IE)", teste: (r) => Number(r.contribuinte_icms) === 1 },
    { label: "Não contribuinte", teste: (r) => Number(r.contribuinte_icms) === 9 },
  ]),
  {
    label: "Receita", opcoes: [
      { label: "CNPJ baixado/inapto", teste: (r) => tag(r, "cnpj_irregular") },
      { label: "IE baixada", teste: (r) => tag(r, "ie_baixada") },
      { label: "Endereço diferente da Receita (2 endereços)", teste: (r) => tag(r, "endereco_receita") },
      { label: "CNPJ ainda não conferido", teste: (r) => temCnpj(r) && !r.receita_em },
      { label: "CNPJ ativo e conferido", teste: (r) => !!r.receita_em && r.receita_situacao === "ATIVA" },
    ],
  },
  { label: "WhatsApp", opcoes: [{ label: "Sem WhatsApp", teste: (r) => !r.whatsapp }, { label: "Com WhatsApp", teste: (r) => !!r.whatsapp }] },
  { label: "Etiqueta", opcoes: [{ label: "Também é fornecedor", teste: (r) => tag(r, "fornecedor") }] },
  filtroCadastradoEm<Cliente>(),
];
const ORDENS = ordensCadastro<Cliente>();

export default function Clientes() {
  const { papel } = usePerfil();
  const [importar, setImportar] = useState(false);
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const [arrumar, setArrumar] = useState(false);
  const [unificar, setUnificar] = useState<string[] | null>(null);
  // mesma consulta da lista (fica em cache): para os repetidos e para unificar
  const { data: todos = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  // quem tem histórico ganha o botão da ficha colorido
  const { data: comHistorico } = useQuery({
    queryKey: ["clientes_com_historico"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("clientes_com_historico");
      if (error) throw error;
      return new Set((data ?? []).map((x: any) => (typeof x === "string" ? x : x.clientes_com_historico ?? x.id)) as string[]);
    },
    staleTime: 60_000,
  });
  // a importação em lote é do financeiro (e admin), como a de produtos
  const podeImportar = papel === "admin" || papel === "financeiro";
  const podeArrumar = papel === "admin" || papel === "financeiro" || papel === "vendas";
  const selecionados = unificar ? todos.filter((c) => unificar.includes(c.id)) : [];
  return (
    <>
    {importar && <ImportarContatos tipo="cliente" onClose={() => setImportar(false)} />}
    {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    {arrumar && <ArrumarCadastro clientes={todos} onClose={() => setArrumar(false)} onUnificar={(ids) => setUnificar(ids)} />}
    {unificar && selecionados.length > 1 && <UnificarClientes key={unificar.join()} clientes={selecionados} onClose={() => setUnificar(null)} />}
    <CrudPage<Cliente>
      filtros={FILTROS}
      ordens={ORDENS}
      podeExcluir={papel === "admin"}
      plural="clientes"
      extraActions={<>
        {podeArrumar && <Button variant="secondary" onClick={() => setArrumar(true)} title="WhatsApp pelo celular, conferência com a Receita, cadastros repetidos e fornecedores na lista"><Wrench size={16} /> Arrumar cadastro</Button>}
        {podeImportar && <Button variant="secondary" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar</Button>}
      </>}
      acoesLote={podeArrumar ? [{
        label: "Unificar",
        executar: async (ids) => {
          if (ids.length < 2) throw new Error("Selecione 2 ou mais cadastros da mesma pessoa/empresa para unificar");
          setUnificar(ids);
          return "Escolha qual cadastro fica";
        },
      }] : []}
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
      rowActions={(r) => {
        const temHistorico = comHistorico?.has(r.id);
        return (
          <button type="button" onClick={() => setFicha(r)}
            title={temHistorico ? "Ficha 360: compras, financeiro, assistência e atendimentos deste cliente" : "Ficha 360: este cliente ainda não tem compras, contas nem atendimentos"}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-semibold transition ${temHistorico
              ? "bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-sm hover:brightness-110"
              : "border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
            <IdCard size={15} /> Ficha 360
          </button>
        );
      }}
      columns={[
        { label: "Cód.", render: (r) => <span className="font-mono text-xs text-slate-500">{r.codigo ?? "—"}</span>, className: "w-14" },
        { label: "Nome", render: (r) => <><NomeCadastro r={r} /><EtiquetasCliente c={r} /></> },
        { label: "CPF/CNPJ", render: (r) => <span className="whitespace-nowrap">{docFormat(r.cpf_cnpj) || "—"}</span> },
        { label: "Contato", render: (r) => <Contato r={r} mensagem={`Olá, ${(r.nome_fantasia || r.nome).split(" ")[0]}! Aqui é da MF Máquinas.`} /> },
        { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
      ]}
    />
    </>
  );
}
