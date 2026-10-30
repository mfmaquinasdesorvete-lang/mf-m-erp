import { dddDe } from "@/lib/buscaCliente";
import { AcoesClienteLista, SeloAssinatura } from "@/components/clientes/AcoesClienteLista";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, EyeOff, Recycle, FileSpreadsheet, IdCard, Wrench, LayoutDashboard, UserPlus } from "lucide-react";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { ImportarContatos } from "@/components/ImportarContatos";
import { ImportarMyFrost } from "@/components/clientes/ImportarMyFrost";
import { FichaCliente } from "@/components/FichaCliente";
import { Button } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { CartaoCadastro, ComAvatar, Contato, ContatoBotoes, Iniciais, NomeCadastro } from "@/components/Contato";
import { digitos, docFormat, pl } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { ArrumarCadastro, EtiquetasCliente, UnificarClientes } from "@/components/clientes/QualidadeClientes";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { useAssinaturasFicha } from "@/components/clientes/AssinaturaFicha";
import { useTiposContato } from "@/components/clientes/TiposContato";
import { MaquinasCliente, rotuloMaquina, useMaquinasPorCliente } from "@/components/clientes/MaquinasCliente";
import { completude, REGIMES, rotuloCrm, STATUS_CRM } from "@/lib/fichaCadastral";
import type { Vendedor } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";
import { notifyError } from "@/lib/notify";
import { cnpjValido } from "@/lib/compliance";
import { ehLicenciado, tagsComLicenciado } from "@/components/clientes/Licenciado";
import { SelosRede, useRedes } from "@/components/clientes/RedeCliente";
import { SELECT_LISTA_CLIENTES } from "@/lib/clientesLista";
import { fundoRede, nomeRede } from "@/lib/redesClientes";

const tag = (r: Cliente, t: string) => (r.tags ?? []).includes(t);
const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
  { name: "compra_maquina_em", label: "Compra da máquina" },
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
  // DDD de qualquer telefone do cliente (o número inteiro, com ou sem +55, vai na busca)
  { label: "DDD", valores: (r) => [r.whatsapp, r.telefone, (r as any).telefone_adicional].map(dddDe) },
  {
    label: "CRM", opcoes: [
      ...STATUS_CRM.map((x) => ({ label: x.label, teste: (r: Cliente) => r.status_crm === x.value })),
      { label: "Sem status", teste: (r: Cliente) => !r.status_crm },
    ],
  },
  filtroCadastradoEm<Cliente>(),
];
const ORDENS = ordensCadastro<Cliente>();

// tira a marca "do portal: conferir" (trava enquanto salva, para não mandar duas vezes)
function BotaoConferido({ id }: { id: string }) {
  const invalidar = useInvalidate();
  const [salvando, setSalvando] = useState(false);
  return (
    <button type="button" className="ml-0.5 rounded underline hover:no-underline" title="Dados conferidos: tirar a marca"
      disabled={salvando} aria-busy={salvando || undefined}
      onClick={async (e) => {
        e.stopPropagation();
        setSalvando(true);
        const { error } = await supabase.from("clientes").update({ portal_conferir: false }).eq("id", id);
        setSalvando(false);
        if (error) notifyError(error); else invalidar("clientes");
      }}>conferido</button>
  );
}

export default function Clientes() {
  const { papel, tem, pode } = usePerfil();
  const [importar, setImportar] = useState(false);
  const [myFrost, setMyFrost] = useState(false);
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const [arrumar, setArrumar] = useState(false);
  const [unificar, setUnificar] = useState<string[] | null>(null);
  const [abrirAgora, setAbrirAgora] = useState<Cliente | null>(null);
  // inativos ficam escondidos; o botão "Inativos" mostra só eles (para conferir e reativar)
  const [verInativos, setVerInativos] = useState(false);
  const tipos = useTiposContato();
  const maquinas = useMaquinasPorCliente();
  const redes = useRedes();
  const invalidar = useInvalidate();
  // mesma consulta da lista (fica em cache): para os repetidos e para unificar
  const { data: todos = [] } = useRows<Cliente>("clientes", { select: SELECT_LISTA_CLIENTES, order: "nome", ascending: true });
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
  const podeImportar = tem("financeiro");
  const podeArrumar = tem("financeiro", "vendas");
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
      label: "Etiqueta", opcoes: tipos.map((t) => ({
        label: t.chave === "fornecedor" ? `Também é ${t.nome.toLowerCase()}` : t.nome, teste: (r: Cliente) => tag(r, t.chave),
      })),
    },
    {
      label: "Ficha", opcoes: [
        { label: "Assinada", teste: (r) => situacaoFicha.get(r.id) === "assinado" },
        { label: "Link enviado, aguardando", teste: (r) => situacaoFicha.get(r.id) === "pendente" },
        { label: "Não assinada", teste: (r) => situacaoFicha.get(r.id) !== "assinado" },
        { label: "Cadastro incompleto", teste: (r) => completude(r, situacaoFicha.get(r.id) === "assinado") < 100 },
      ],
    },
    { label: "Vendedor", valor: (r) => vendedores.find((v) => v.id === r.vendedor_id)?.nome ?? null },
    // cliente novo cadastrado pelo representante no portal
    { label: "Portal do representante", opcoes: [{ label: "Para conferir", teste: (r: Cliente) => !!r.portal_conferir }] },
    {
      // modelo da máquina (vendida pela MF ou pela My Frost), usada e quem ainda não tem máquina
      label: "Máquina", opcoes: [
        ...[...new Set([...maquinas.values()].flat().map((m) => rotuloMaquina(m.descricao)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((modelo) => ({ label: modelo, teste: (r: Cliente) => (maquinas.get(r.id) ?? []).some((m) => rotuloMaquina(m.descricao) === modelo) })),
        { label: "Comprou máquina usada", teste: (r: Cliente) => tag(r, "compra_usada") || (maquinas.get(r.id) ?? []).some((m) => m.usada) },
        { label: "Com data de compra da máquina", teste: (r: Cliente) => !!r.compra_maquina_em },
        { label: "Sem máquina", teste: (r: Cliente) => !maquinas.has(r.id) && !r.compra_maquina_em },
      ],
    },
  ], [situacaoFicha, vendedores, tipos, maquinas]);
  return (
    <>
    {importar && <ImportarContatos tipo="cliente" onClose={() => setImportar(false)} />}
    {myFrost && <ImportarMyFrost onClose={() => setMyFrost(false)} />}
    {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    {arrumar && <ArrumarCadastro clientes={todos} onClose={() => setArrumar(false)} onUnificar={(ids) => setUnificar(ids)} />}
    {unificar && selecionados.length > 1 && <UnificarClientes key={unificar.join()} clientes={selecionados} onClose={() => setUnificar(null)} />}
    <CrudPage<Cliente>
      filtros={filtros}
      ordens={ORDENS}
      podeExcluir={papel === "admin"}
      plural="clientes"
      extraActions={<>
        <Link to="/painel/cadastros" className="inline-flex min-h-toque items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-0"><LayoutDashboard size={16} /> Painel dos clientes</Link>
        <Button variant={verInativos ? "primary" : "secondary"} onClick={() => setVerInativos((v) => !v)} title="Clientes inativados: ficam fora da lista, com o histórico guardado">
          <EyeOff size={16} /> {verInativos ? "Voltar aos ativos" : `Inativos (${todos.filter((c) => c.inativo_em).length})`}
        </Button>
        {podeArrumar && <Button variant="secondary" onClick={() => setArrumar(true)} title="WhatsApp pelo celular, conferência com a Receita, cadastros repetidos e fornecedores na lista"><Wrench size={16} /> Arrumar cadastro</Button>}
        {podeImportar && <Button variant="secondary" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar</Button>}
        {papel === "admin" && <Button variant="secondary" onClick={() => setMyFrost(true)} title="Clientes, máquinas e peças da My Frost Máquinas (empresa anterior), do backup do Tiny"><Archive size={16} /> Base da My Frost</Button>}
      </>}
      acoesLote={podeArrumar ? [{
        label: verInativos ? "Reativar" : "Inativar",
        executar: async (ids) => {
          const inativar = !verInativos;
          if (inativar && !(await confirmar(`Inativar ${ids.length} ${pl(ids.length, "cliente", "clientes")}? ${pl(ids.length, "Ele sai", "Eles saem")} da lista, mas pedidos, notas, máquinas e marcadores continuam guardados. Dá para reativar no botão "Inativos".`))) {
            throw new Error("Nada foi inativado");
          }
          for (let i = 0; i < ids.length; i += 200) {
            const { error } = await supabase.from("clientes")
              .update(inativar ? { inativo_em: new Date().toISOString(), inativo_motivo: "inativado na lista" } : { inativo_em: null, inativo_motivo: null })
              .in("id", ids.slice(i, i + 200));
            if (error) throw error;
          }
          return `${ids.length} ${pl(ids.length, "cliente", "clientes")} ${inativar ? pl(ids.length, "inativado", "inativados") : pl(ids.length, "reativado", "reativados")}`;
        },
      }, {
        label: "Unificar",
        executar: async (ids) => {
          if (ids.length < 2) throw new Error("Selecione 2 ou mais cadastros da mesma pessoa/empresa para unificar");
          setUnificar(ids);
          return "Escolha qual cadastro fica";
        },
      }, {
        label: "Mover para fornecedores",
        executar: async (ids) => {
          if (!(await confirmar(`${ids.length} ${pl(ids.length, "cadastro", "cadastros")} vão para Fornecedores e saem da lista de clientes. Os anexos vão junto; pedidos, notas e contas antigos continuam no histórico. Continuar?`))) {
            throw new Error("Nada foi movido");
          }
          const { data, error } = await supabase.rpc("clientes_virar_fornecedor", { p_ids: ids, p_manter_cliente: false });
          if (error) throw error;
          invalidar("fornecedores", "documentos");
          return `${data?.movidos ?? 0} ${pl(data?.movidos ?? 0, "movido", "movidos")} para Fornecedores (${data?.fornecedores_criados ?? 0} ${pl(data?.fornecedores_criados ?? 0, "fornecedor", "fornecedores")} ${pl(data?.fornecedores_criados ?? 0, "novo", "novos")}, os outros juntaram com o do mesmo CNPJ)`;
        },
      }, ...[true, false].map((marcar) => ({
        // licenciados da My Frost Sorveterias: etiqueta usada pela Venda de Máquinas e pelas propostas
        label: marcar ? "Marcar como licenciado My Frost" : "Tirar a marca de licenciado",
        executar: async (ids: string[]) => {
          const mudar = todos.filter((c) => ids.includes(c.id) && ehLicenciado(c) !== marcar);
          for (let i = 0; i < mudar.length; i += 20) {
            const res = await Promise.all(mudar.slice(i, i + 20).map((c) =>
              supabase.from("clientes").update({ tags: tagsComLicenciado(c.tags, marcar) }).eq("id", c.id)));
            const erro = res.find((r) => r.error)?.error;
            if (erro) throw erro;
          }
          invalidar("pedidos", "propostas_tiny");
          const ja = ids.length - mudar.length;
          return `${mudar.length} ${pl(mudar.length, "cliente", "clientes")} ${marcar ? `${pl(mudar.length, "marcado", "marcados")} como licenciado My Frost` : `sem a marca de licenciado`}${ja ? ` (${ja} já ${pl(ja, "estava", "estavam")} assim)` : ""}`;
        },
      }))] : []}
      anexos="cliente"
      title="Clientes"
      table="clientes"
      select={SELECT_LISTA_CLIENTES}
      marcadores={["cliente", "clientes"]}
      filtroBase={verInativos ? (r) => !!r.inativo_em : (r) => !r.inativo_em}
      fundoLinha={(r) => { const rede = redes(r)[0]; return rede ? fundoRede(rede.familia) : undefined; }}
      order="nome"
      defaults={{ tipo_pessoa: "PF", contribuinte_icms: 9, nome: "", avisos_email: true }}
      searchKeys={["codigo", "nome", "nome_fantasia", "cpf_cnpj", "whatsapp", "telefone", "telefone_adicional", "email", "email_nfe", "municipio", "condicao_pagamento"]}
      formulario={(r, fechar) => <ClienteForm key={r.id ?? "novo"} registro={r} onClose={fechar} />}
      editarAgora={abrirAgora}
      semResultado={(busca) => {
        // CPF/CNPJ digitado (com ou sem pontos) que não está no cadastro: diz isso e oferece cadastrar
        const d = digitos(busca);
        if (![11, 14].includes(d.length) || !/^[\d\s.\-/()]+$/.test(busca)) return null;
        const cnpj = d.length === 14;
        const filiais = cnpj ? todos.filter((c) => digitos(c.cpf_cnpj).slice(0, 8) === d.slice(0, 8)) : [];
        return (
          <div className="cartao mb-3 p-4 text-sm">
            <p className="text-fg"><b>Nenhum cliente com o {cnpj ? "CNPJ" : "CPF"} {docFormat(d)}.</b>{" "}
              {cnpj && !cnpjValido(d) ? <span className="text-red-600">Esse CNPJ não é válido: confira os números.</span> : "Ele ainda não está cadastrado no ERP."}</p>
            {filiais.length > 0 && (
              <div className="mt-2 text-slate-600">
                Mesma empresa (outra filial):
                <ul className="mt-1 space-y-1">
                  {filiais.slice(0, 5).map((c) => (
                    <li key={c.id}><button type="button" className="link-acao" onClick={() => setAbrirAgora({ ...c })}>{c.nome_fantasia || c.nome}</button> <span className="num text-xs">{docFormat(c.cpf_cnpj)}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {papel !== "contador" && (
              <Button type="button" className="mt-3" onClick={() => setAbrirAgora({ tipo_pessoa: cnpj ? "PJ" : "PF", cpf_cnpj: d, contribuinte_icms: 9, nome: "", avisos_email: true } as unknown as Cliente)}>
                <UserPlus size={15} /> Cadastrar cliente com este {cnpj ? "CNPJ" : "CPF"}
              </Button>
            )}
          </div>
        );
      }}
      fields={FIELDS}
      rowActions={(r) => {
        const temHistorico = comHistorico?.has(r.id);
        return (<>
          <AcoesClienteLista c={r} ficha={situacaoFicha.get(r.id)} />
          <button type="button" onClick={() => setFicha(r)}
            title={temHistorico ? "Ficha 360: compras, financeiro, assistência e atendimentos deste cliente" : "Ficha 360: este cliente ainda não tem compras, contas nem atendimentos"}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold transition ${temHistorico
              ? "bg-brand text-brand-fg shadow-sm hover:bg-brand-dark"
              : "border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
            <IdCard size={15} /> Ficha 360
          </button>
        </>);
      }}
      columns={[
        {
          label: "Nome", render: (r) => {
            const crm = rotuloCrm(r.status_crm);
            const f = situacaoFicha.get(r.id);
            return (<ComAvatar nome={r.nome_fantasia || r.nome}>
              <NomeCadastro r={r} />
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {r.codigo != null && <span className="font-mono text-2xs text-slate-500">cód. {r.codigo}</span>}
                {crm && <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-2xs font-semibold ${crm.cor}`}>{crm.label.replace(/ \(.*\)$/, "")}</span>}
                <SeloAssinatura f={f} />
                <SeloUsada r={r} maquinas={maquinas.get(r.id) ?? []} />
                {r.portal_conferir && (
                  <span title="Cadastrado pelo representante no portal: confira os dados" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-900">
                    do portal: conferir
                    {pode("editar_clientes") && (
                      <BotaoConferido id={r.id} />
                    )}
                  </span>
                )}
              </div>
              <EtiquetasCliente c={r} tipos={tipos} naLista />
              <SelosRede redes={redes(r)} />
              <MaquinasCliente maquinas={maquinas.get(r.id) ?? []} compra={r.compra_maquina_em} />
            </ComAvatar>);
          },
        },
        // cidade embaixo do documento: uma coluna a menos para a lista caber no notebook
        { label: "CPF/CNPJ e cidade", render: (r) => <><span className="whitespace-nowrap">{docFormat(r.cpf_cnpj) || "—"}</span><div className="text-xs text-slate-500">{[r.municipio, r.uf].filter(Boolean).join("/")}</div></> },
        { label: "Contato", render: (r) => <Contato enxuto r={r} mensagem={`Olá, ${(r.nome_fantasia || r.nome).split(" ")[0]}! Aqui é da MF Máquinas.`} /> },
      ]}
      // WhatsApp e e-mail no rodapé do cartão, ao lado do Editar (24/10: uma linha a menos em cada cliente)
      rodapeCelular={(r) => <ContatoBotoes enxuto pequeno r={r} mensagem={`Olá, ${(r.nome_fantasia || r.nome).split(" ")[0]}! Aqui é da MF Máquinas.`} />}
      // no cartão não repete o que já aparece de outro jeito (24/10): "F - rede" vira o selo da rede; "MF - A 200" e
      // "My - Vendeu" já estão na etiqueta da máquina e na categoria. Os marcadores continuam no cadastro e no botão.
      ocultarMarcadorNoCartao={(r, nome) => {
        if (nomeRede(nome)) return true;
        const m = /^\s*(MF|My)\s*-\s*(.+)$/i.exec(nome);
        if (!m) return false;
        const x = normal(m[2]);
        const mostrados = [...(maquinas.get(r.id) ?? []).map((q) => rotuloMaquina(q.descricao)), ...tipos.filter((t) => tag(r, t.chave)).map((t) => t.nome)].map(normal);
        return mostrados.some((v) => v === x || v.startsWith(`${x} `) || x.startsWith(`${v} `));
      }}
      cartaoCelular={(r, abrir) => {
        const fantasia = r.nome_fantasia && r.nome_fantasia.trim().toLowerCase() !== r.nome.trim().toLowerCase() ? r.nome_fantasia : null;
        const crm = rotuloCrm(r.status_crm);
        return (
          <CartaoCadastro onAbrir={abrir} avatar={<Iniciais nome={fantasia ?? r.nome} />} titulo={fantasia ?? r.nome}
            subtitulo={fantasia ? r.nome : undefined}
            meta={<>{[[r.municipio, r.uf].filter(Boolean).join("/"), r.codigo != null ? `cód. ${r.codigo}` : null].filter(Boolean).join(" · ")}
              {r.cpf_cnpj && <span className="num block">{docFormat(r.cpf_cnpj)}</span>}</>}
            selos={<>
              <SeloAssinatura f={situacaoFicha.get(r.id)} />
              <SeloUsada r={r} maquinas={maquinas.get(r.id) ?? []} />
              {crm && <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ${crm.cor}`}>{crm.label.replace(/ \(.*\)$/, "")}</span>}
              <EtiquetasCliente c={r} tipos={tipos} naLista />
              <SelosRede redes={redes(r)} />
              <MaquinasCliente maquinas={maquinas.get(r.id) ?? []} compra={r.compra_maquina_em} tamanho="mini" junto />
            </>} />
        );
      }}
    />
    </>
  );
}

/** Ficha cadastral do cliente na lista: sempre um selo, assinada (verde), aguardando (azul) ou não assinada (cinza). */
/** Comprou máquina usada (etiqueta, marcador do Tiny ou máquina usada registrada): selo forte, para ver de longe. Inativo: selo cinza. */
function SeloUsada({ r, maquinas }: { r: Cliente; maquinas: { usada?: boolean | null }[] }) {
  const usada = tag(r, "compra_usada") || maquinas.some((m) => m.usada);
  return (<>
    {usada && <span title="Comprou máquina usada" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm"><Recycle size={13} aria-hidden /> USADA</span>}
    {r.inativo_em && <span title={r.inativo_motivo ?? "Cliente inativo"} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-500 px-2 py-0.5 text-xs font-bold text-white"><EyeOff size={13} aria-hidden /> inativo</span>}
  </>);
}
