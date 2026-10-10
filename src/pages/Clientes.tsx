import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, FileSpreadsheet, IdCard, Wrench } from "lucide-react";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { ImportarContatos } from "@/components/ImportarContatos";
import { FichaCliente } from "@/components/FichaCliente";
import { Button } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { Contato, NomeCadastro } from "@/components/Contato";
import { digitos, docFormat } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { ArrumarCadastro, EtiquetasCliente, UnificarClientes } from "@/components/clientes/QualidadeClientes";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { useAssinaturasFicha } from "@/components/clientes/AssinaturaFicha";
import { completude, REGIMES, rotuloCrm, STATUS_CRM } from "@/lib/fichaCadastral";
import type { Vendedor } from "@/lib/types";

const tag = (r: Cliente, t: string) => (r.tags ?? []).includes(t);
const temCnpj = (r: Cliente) => digitos(r.cpf_cnpj).length === 14;

// Campos da planilha exportada (o formulário é o ClienteForm, em abas)
const FIELDS: CampoForm[] = [
  { name: "codigo", label: "Código", type: "readonly" },
  { name: "tipo_pessoa", label: "Tipo", type: "select", options: [{ value: "PF", label: "Pessoa física" }, { value: "PJ", label: "Pessoa jurídica" }] },
  { name: "cpf_cnpj", label: "CPF / CNPJ", mask: "doc" },
  { name: "nome_fantasia", label: "Nome fantasia" },
  { name: "nome", label: "Razão social / nome completo", required: true },
  { name: "inscricao_estadual", label: "Inscrição estadual", mask: "ie" },
  { name: "inscricao_municipal", label: "Inscrição municipal" },
  {
    name: "contribuinte_icms", label: "Contribuinte ICMS", type: "select",
    options: [
      { value: 9, label: "Não contribuinte (consumidor final)" },
      { value: 1, label: "Contribuinte (tem IE)" },
      { value: 2, label: "Isento de inscrição" },
    ],
  },
  { name: "whatsapp", label: "WhatsApp", mask: "whatsapp" },
  { name: "telefone", label: "Telefone", mask: "telefone" },
  { name: "telefone_adicional", label: "Telefone adicional", mask: "telefone" },
  { name: "email", label: "E-mail", mask: "email" },
  { name: "email_nfe", label: "E-mail para NF-e", mask: "email" },
  { name: "website", label: "Site" },
  { name: "avisos_email", label: "Recebe avisos por e-mail", type: "checkbox" },
  { name: "cep", label: "CEP", mask: "cep" },
  { name: "logradouro", label: "Logradouro" },
  { name: "numero", label: "Número" },
  { name: "complemento", label: "Complemento" },
  { name: "bairro", label: "Bairro" },
  { name: "municipio", label: "Município" },
  { name: "uf", label: "UF", mask: "uf" },
  { name: "cobranca_logradouro", label: "Cobrança: logradouro" },
  { name: "cobranca_numero", label: "Cobrança: número" },
  { name: "cobranca_bairro", label: "Cobrança: bairro" },
  { name: "cobranca_municipio", label: "Cobrança: município" },
  { name: "cobranca_uf", label: "Cobrança: UF" },
  { name: "cobranca_cep", label: "Cobrança: CEP" },
  { name: "regime_tributario", label: "Regime tributário", type: "select", options: REGIMES },
  { name: "inscricao_suframa", label: "Inscrição Suframa" },
  { name: "data_nascimento", label: "Data de nascimento / abertura" },
  { name: "status_crm", label: "Status no CRM", type: "select", options: STATUS_CRM.map(({ value, label }) => ({ value, label })) },
  { name: "condicao_pagamento", label: "Condição de pagamento" },
  { name: "desconto_padrao", label: "Desconto padrão (%)" },
  { name: "limite_credito", label: "Limite de crédito" },
  { name: "observacoes", label: "Observações", type: "textarea" },
  { name: "preferencias", label: "Preferências", type: "textarea" },
];

const filtrosBase = (): FiltroCrud<Cliente>[] => [
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
  {
    label: "CRM", opcoes: [
      ...STATUS_CRM.map((x) => ({ label: x.label, teste: (r: Cliente) => r.status_crm === x.value })),
      { label: "Sem status", teste: (r: Cliente) => !r.status_crm },
    ],
  },
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
  // ficha assinada / link enviado, por cliente
  const { data: assinaturas = [] } = useAssinaturasFicha();
  const situacaoFicha = useMemo(() => {
    const m = new Map<string, "assinado" | "pendente">();
    for (const a of assinaturas) {
      if (a.status === "assinado") m.set(a.cliente_id, "assinado");
      else if (a.status === "pendente" && new Date(a.expira_em) > new Date() && !m.has(a.cliente_id)) m.set(a.cliente_id, "pendente");
    }
    return m;
  }, [assinaturas]);
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const filtros = useMemo<FiltroCrud<Cliente>[]>(() => [
    ...filtrosBase(),
    {
      label: "Ficha", opcoes: [
        { label: "Assinada", teste: (r) => situacaoFicha.get(r.id) === "assinado" },
        { label: "Link enviado, aguardando", teste: (r) => situacaoFicha.get(r.id) === "pendente" },
        { label: "Não assinada", teste: (r) => situacaoFicha.get(r.id) !== "assinado" },
        { label: "Cadastro incompleto", teste: (r) => completude(r, situacaoFicha.get(r.id) === "assinado") < 100 },
      ],
    },
    { label: "Vendedor", valor: (r) => vendedores.find((v) => v.id === r.vendedor_id)?.nome ?? null },
  ], [situacaoFicha, vendedores]);
  return (
    <>
    {importar && <ImportarContatos tipo="cliente" onClose={() => setImportar(false)} />}
    {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    {arrumar && <ArrumarCadastro clientes={todos} onClose={() => setArrumar(false)} onUnificar={(ids) => setUnificar(ids)} />}
    {unificar && selecionados.length > 1 && <UnificarClientes key={unificar.join()} clientes={selecionados} onClose={() => setUnificar(null)} />}
    <CrudPage<Cliente>
      filtros={filtros}
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
      searchKeys={["codigo", "nome", "nome_fantasia", "cpf_cnpj", "whatsapp", "telefone", "telefone_adicional", "email", "email_nfe", "municipio", "condicao_pagamento"]}
      formulario={(r, fechar) => <ClienteForm key={r.id ?? "novo"} registro={r} onClose={fechar} />}
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
        {
          label: "Nome", render: (r) => {
            const crm = rotuloCrm(r.status_crm);
            const f = situacaoFicha.get(r.id);
            return (<>
              <NomeCadastro r={r} />
              <div className="mt-0.5 flex flex-wrap gap-1">
                {crm && <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${crm.cor}`}>{crm.label.replace(/ \(.*\)$/, "")}</span>}
                {f === "assinado" && <span title="Ficha cadastral assinada" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800"><BadgeCheck size={11} aria-hidden /> ficha assinada</span>}
                {f === "pendente" && <span title="Link da ficha enviado, aguardando a assinatura" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800"><Clock size={11} aria-hidden /> aguardando assinatura</span>}
              </div>
              <EtiquetasCliente c={r} />
            </>);
          },
        },
        { label: "CPF/CNPJ", render: (r) => <span className="whitespace-nowrap">{docFormat(r.cpf_cnpj) || "—"}</span> },
        { label: "Contato", render: (r) => <Contato r={r} mensagem={`Olá, ${(r.nome_fantasia || r.nome).split(" ")[0]}! Aqui é da MF Máquinas.`} /> },
        { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
      ]}
    />
    </>
  );
}
