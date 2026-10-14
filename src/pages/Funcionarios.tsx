// Funcionários (RH): cadastro da equipe com dados pessoais, contrato, salário e pagamento, documentos anexados
// e a ligação com o usuário do ERP, o vendedor (comissões) e a assistência técnica (técnicos da OS).
// Só admin e financeiro veem (salário, CPF e conta são dados sensíveis; o banco garante isso).
// CPF, RG, PIS, CTPS, CNH, banco, agência, conta e Pix ficam em funcionarios_sigilo: a lista mostra só parte,
// e ver por inteiro ou alterar passa por funções do banco que registram quem fez (Usuários → Segurança do acesso).
// "Lançar salários" cria as contas a pagar do mês (uma por pessoa), sem repetir as que já foram lançadas.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Cake, Eye, HandCoins, Lock, Users, Wallet } from "lucide-react";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { Badge, Button, CampoMes, Field, Indicador, Modal } from "@/components/ui";
import { Contato } from "@/components/Contato";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { completarPorCep } from "@/lib/cadastro";
import { erroCampo, gravar, mostrar, type Mascara } from "@/lib/mascaras";

export type Funcionario = {
  id: string; nome: string; apelido: string | null; cpf: string | null; rg: string | null; data_nascimento: string | null;
  estado_civil: string | null; escolaridade: string | null; email: string | null; whatsapp: string | null; telefone: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null;
  unidade_id: string | null; cargo: string | null; setor: string | null; vinculo: string; situacao: string;
  data_admissao: string | null; data_desligamento: string | null; motivo_desligamento: string | null; jornada: string | null;
  salario: number | null; dia_pagamento: number | null; pis: string | null; ctps: string | null;
  cnh: string | null; cnh_categoria: string | null; cnh_validade: string | null;
  banco: string | null; agencia: string | null; conta: string | null; pix: string | null;
  beneficios: string | null; contato_emergencia: string | null; faz_assistencia: boolean;
  user_id: string | null; vendedor_id: string | null; observacoes: string | null; ativo: boolean; created_at: string;
};

const VINCULOS = [
  { value: "clt", label: "CLT" }, { value: "experiencia", label: "CLT em experiência" }, { value: "estagio", label: "Estágio" },
  { value: "aprendiz", label: "Jovem aprendiz" }, { value: "temporario", label: "Temporário" }, { value: "pj", label: "PJ (prestador)" },
  { value: "autonomo", label: "Autônomo" }, { value: "socio", label: "Sócio (pró-labore)" },
];
const SITUACOES = [
  { value: "ativo", label: "Ativo" }, { value: "ferias", label: "Em férias" }, { value: "afastado", label: "Afastado" }, { value: "desligado", label: "Desligado" },
];
const SETORES = ["Produção", "Assistência técnica", "Vendas", "Financeiro e administrativo", "Expedição e logística", "Compras", "Diretoria", "Outro"];
const rotuloVinculo = (v: string) => VINCULOS.find((x) => x.value === v)?.label ?? v;
/** Categoria da conta a pagar do salário (a mesma do plano de contas). */
const categoriaDoVinculo = (v: string) => (v === "socio" ? "pró-labore" : v === "pj" || v === "autonomo" ? "serviços profissionais" : "folha");
const nomeCurto = (f: Pick<Funcionario, "nome" | "apelido">) => f.apelido?.trim() || f.nome;

/** "2 anos e 3 meses" desde a admissão. */
export function tempoDeCasa(admissao: string | null, ate = hoje()) {
  if (!admissao) return null;
  const [a1, m1, d1] = admissao.split("-").map(Number), [a2, m2, d2] = ate.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 0) return "começa em breve";
  if (meses === 0) return "menos de 1 mês";
  const anos = Math.floor(meses / 12); meses %= 12;
  return [anos && `${anos} ${anos === 1 ? "ano" : "anos"}`, meses && `${meses} ${meses === 1 ? "mês" : "meses"}`].filter(Boolean).join(" e ");
}

const somarDias = (d: string, n: number) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

/** Contrato de experiência (45 + 45 dias): o próximo marco nos próximos 15 dias. */
export function fimExperiencia(f: Pick<Funcionario, "vinculo" | "situacao" | "data_admissao">, dia = hoje()) {
  if (!f.data_admissao || f.situacao === "desligado" || !["clt", "experiencia"].includes(f.vinculo)) return null;
  for (const [n, rotulo] of [[44, "1º período (45 dias)"], [89, "fim da experiência (90 dias)"]] as const) {
    const fim = somarDias(f.data_admissao, n);
    if (fim >= dia && fim <= somarDias(dia, 15)) return { fim, rotulo };
  }
  return null;
}

const ativos = (l: Funcionario[]) => l.filter((f) => f.ativo && f.situacao !== "desligado");

// ---------- dados sigilosos ----------
type CampoSigilo = "cpf" | "rg" | "pis" | "ctps" | "cnh" | "pix" | "banco" | "agencia" | "conta";
const CAMPOS_SIGILO: { k: CampoSigilo; rotulo: string; mask?: Mascara }[] = [
  { k: "cpf", rotulo: "CPF", mask: "doc" }, { k: "rg", rotulo: "RG" }, { k: "pis", rotulo: "PIS/NIS" }, { k: "ctps", rotulo: "Carteira de trabalho (CTPS)" },
  { k: "cnh", rotulo: "CNH" }, { k: "pix", rotulo: "Chave Pix" }, { k: "banco", rotulo: "Banco" }, { k: "agencia", rotulo: "Agência" }, { k: "conta", rotulo: "Conta" },
];
/** CPF de funcionário: 11 números e dígitos verificadores certos. */
const erroSigilo = (c: { mask?: Mascara }, v: string | undefined) => {
  if (!c.mask || !v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return "o CPF tem 11 números";
  return erroCampo(c.mask, d);
};
/** O que a lista mostra: só uma parte de cada dado (vem mascarado do banco). */
type ResumoSigilo = Partial<Record<CampoSigilo, string | null>> & { funcionario_id: string; preenchidos: number };
/** No formulário: os valores inteiros, depois de "Mostrar" (ou de um cadastro novo). */
type EstadoSigilo = { valores: Partial<Record<CampoSigilo, string>>; alterado: boolean };

function useResumoSigilo() {
  const { data = [] } = useQuery({
    queryKey: ["funcionarios_sigilo_resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("funcionarios_sigilo_resumo");
      return error ? [] : (data ?? []) as ResumoSigilo[];
    },
  });
  return useMemo(() => new Map(data.map((r) => [r.funcionario_id, r])), [data]);
}

/** Bloco do formulário: parcial e trancado; "Mostrar e editar" abre (e o banco registra quem viu). */
function DadosSigilosos({ id, resumo, estado, onChange }: {
  id?: string; resumo?: ResumoSigilo; estado?: EstadoSigilo; onChange: (e: EstadoSigilo) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const aberto = !id || !!estado;
  async function mostrarTudo() {
    setAbrindo(true);
    try {
      const { data, error } = await supabase.rpc("funcionario_sigilo_ver", { p_funcionario: id });
      if (error) throw error;
      onChange({ valores: Object.fromEntries(CAMPOS_SIGILO.map((c) => [c.k, (data as Record<string, string | null> | null)?.[c.k] ?? ""])), alterado: false });
    } catch (e) { notifyError(e); } finally { setAbrindo(false); }
  }

  if (!aberto) {
    return (
      <div className="rounded-xl border border-slate-200 p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {CAMPOS_SIGILO.map((c) => (
            <div key={c.k} className="min-w-0">
              <dt className="text-xs text-slate-500">{c.rotulo}</dt>
              <dd className="truncate font-mono text-fg">{resumo?.[c.k] || <span className="font-sans text-slate-400">—</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={abrindo} onClick={mostrarTudo}><Eye size={15} /> {abrindo ? "Abrindo…" : "Mostrar e editar"}</Button>
          <span className="text-xs text-slate-500">Fica registrado que você viu (o administrador confere em Usuários → Segurança do acesso).</span>
        </div>
      </div>
    );
  }
  const valores = estado?.valores ?? {};
  const set = (k: CampoSigilo, v: string) => onChange({ valores: { ...valores, [k]: v }, alterado: true });
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
      {CAMPOS_SIGILO.map((c) => {
        const erro = erroSigilo(c, valores[c.k]);
        return (
          <Field key={c.k} label={c.rotulo} className="min-w-0">
            <input className={`input ${erro ? "!border-red-400" : ""}`} autoComplete="off" inputMode={c.mask ? "numeric" : undefined}
              value={c.mask ? mostrar(c.mask, valores[c.k] ?? "") : valores[c.k] ?? ""}
              onChange={(e) => set(c.k, c.mask ? gravar(c.mask, e.target.value) : e.target.value)} />
            {erro && <span className="mt-1 block text-xs text-red-700">{erro}</span>}
          </Field>
        );
      })}
    </div>
  );
}

const FILTROS: FiltroCrud<Funcionario>[] = [
  { label: "Situação", opcoes: [
    { label: "Na equipe (sem desligados)", teste: (f) => f.situacao !== "desligado" },
    ...SITUACOES.map((s) => ({ label: s.label, teste: (f: Funcionario) => f.situacao === s.value })),
  ] },
  { label: "Setor", valor: (f) => f.setor },
  { label: "Vínculo", valor: (f) => rotuloVinculo(f.vinculo) },
  { label: "Técnicos", opcoes: [{ label: "Faz assistência técnica", teste: (f) => f.faz_assistencia }] },
];

export default function Funcionarios() {
  const { papel, pode } = usePerfil();
  const { unidades, codigo, padrao } = useUnidade();
  const { data: lista = [] } = useRows<Funcionario>("funcionarios", { order: "nome", ascending: true });
  const { data: vendedores = [] } = useRows<{ id: string; nome: string; ativo: boolean }>("vendedores", { order: "nome", ascending: true });
  const { data: usuarios = [] } = useRows<{ user_id: string; nome: string; ativo: boolean }>("usuarios_erp", { select: "user_id, nome, ativo", order: "nome", ascending: true });
  const [lancar, setLancar] = useState(false);
  const resumo = useResumoSigilo();
  const invalidar = useInvalidate();

  const equipe = ativos(lista);
  const mes = hoje().slice(5, 7);
  const aniversariantes = equipe.filter((f) => f.data_nascimento?.slice(5, 7) === mes)
    .sort((a, b) => (a.data_nascimento ?? "").slice(8).localeCompare((b.data_nascimento ?? "").slice(8)));
  const experiencias = equipe.map((f) => ({ f, e: fimExperiencia(f) })).filter((x) => x.e);
  const folha = equipe.reduce((s, f) => s + Number(f.salario ?? 0), 0);

  const opcoesUnidade = [{ value: "", label: "—" }, ...unidades.map((u) => ({ value: u.id, label: u.nome }))];
  const fields: CampoForm[] = [
    { name: "nome", label: "Nome completo", required: true, span: 3 },
    { name: "apelido", label: "Como é chamado", span: 1 },
    { name: "cargo", label: "Cargo", placeholder: "Ex.: montador, técnico de campo, vendedora", span: 2 },
    { name: "setor", label: "Setor", type: "select", options: [{ value: "", label: "—" }, ...SETORES.map((s) => ({ value: s, label: s }))], span: 1 },
    { name: "unidade_id", label: "Unidade", type: "select", options: opcoesUnidade, span: 1 },
    { name: "vinculo", label: "Vínculo", type: "select", options: VINCULOS, span: 1 },
    { name: "situacao", label: "Situação", type: "select", options: SITUACOES, span: 1 },
    { name: "data_admissao", label: "Admissão", type: "date", span: 1 },
    { name: "jornada", label: "Jornada", placeholder: "Seg a sex, 8h às 18h", span: 1 },

    { name: "s_pessoal", label: "Dados pessoais", type: "secao", ajuda: "Documentos para a admissão e o eSocial." },
    { name: "data_nascimento", label: "Nascimento", type: "date", span: 1 },
    { name: "estado_civil", label: "Estado civil", type: "select", span: 1,
      options: ["", "Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"].map((v) => ({ value: v, label: v || "—" })) },
    { name: "escolaridade", label: "Escolaridade", type: "select", span: 2,
      options: ["", "Fundamental", "Médio", "Técnico", "Superior", "Pós-graduação"].map((v) => ({ value: v, label: v || "—" })) },

    { name: "s_sigilo", label: "Documentos e conta (sigilosos)", type: "secao",
      ajuda: "CPF, RG, PIS, CTPS, CNH, banco e Pix ficam protegidos: aparecem só em parte e, para ver por inteiro, o ERP registra quem viu." },
    { name: "__sigilo", label: "Documentos, CNH e dados para pagamento", type: "custom", span: 4,
      render: (valor, set, row) => <DadosSigilosos id={row.id} resumo={row.id ? resumo.get(row.id) : undefined} estado={valor} onChange={set} /> },

    { name: "s_contato", label: "Contato", type: "secao" },
    { name: "whatsapp", label: "WhatsApp", mask: "whatsapp", span: 1 },
    { name: "telefone", label: "Telefone", mask: "telefone", span: 1 },
    { name: "email", label: "E-mail", mask: "email", span: 2 },
    { name: "contato_emergencia", label: "Em emergência, avisar (nome e telefone)", span: 4 },

    { name: "s_endereco", label: "Endereço", type: "secao" },
    { name: "cep", label: "CEP", mask: "cep", buscar: true, span: 1 },
    { name: "logradouro", label: "Logradouro", span: 3 },
    { name: "numero", label: "Número", span: 1 },
    { name: "complemento", label: "Complemento", span: 1 },
    { name: "bairro", label: "Bairro", span: 2 },
    { name: "municipio", label: "Município", span: 3 },
    { name: "uf", label: "UF", mask: "uf", span: 1 },

    { name: "s_pagamento", label: "Salário e pagamento", type: "secao", ajuda: "Salário bruto do contrato. O líquido de cada mês vem da folha do contador." },
    { name: "salario", label: "Salário (R$)", type: "number", span: 1 },
    { name: "dia_pagamento", label: "Dia do pagamento", type: "number", placeholder: "5", span: 1 },
    { name: "beneficios", label: "Benefícios (vale-transporte, alimentação, plano de saúde…)", type: "textarea", span: 4 },

    { name: "s_sistema", label: "Assistência técnica e acesso ao ERP", type: "secao", ajuda: "Liga a pessoa ao login, às comissões e à lista de técnicos da OS." },
    { name: "faz_assistencia", label: "Faz assistência técnica (aparece como técnico na OS)", type: "checkbox", span: 4 },
    { name: "cnh_categoria", label: "Categoria da CNH", span: 2 },
    { name: "cnh_validade", label: "Validade da CNH", type: "date", span: 2 },
    { name: "user_id", label: "Usuário do ERP", type: "select", span: 2,
      options: [{ value: "", label: "Sem acesso ao ERP" }, ...usuarios.map((u) => ({ value: u.user_id, label: u.nome + (u.ativo ? "" : " (inativo)") }))] },
    { name: "vendedor_id", label: "Vendedor (comissões)", type: "select", span: 2,
      options: [{ value: "", label: "Não vende" }, ...vendedores.map((v) => ({ value: v.id, label: v.nome + (v.ativo ? "" : " (inativo)") }))] },

    { name: "s_saida", label: "Desligamento", type: "secao" },
    { name: "data_desligamento", label: "Data do desligamento", type: "date", span: 1 },
    { name: "motivo_desligamento", label: "Motivo", span: 3 },
    { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador rotulo="Na equipe" icon={Users} cor="azul" valor={String(equipe.length)}
          sub={`${equipe.filter((f) => f.faz_assistencia).length} técnico(s) · ${equipe.filter((f) => f.situacao === "ferias").length} em férias`} />
        <Indicador rotulo="Salários (bruto/mês)" icon={Wallet} cor="laranja" valor={brl(folha)} sub="soma dos salários da equipe" />
        <Indicador rotulo="Aniversariantes do mês" icon={Cake} cor="roxo" valor={String(aniversariantes.length)}
          sub={aniversariantes.length ? aniversariantes.map((f) => `${nomeCurto(f)} (${f.data_nascimento!.slice(8)})`).join(", ") : "ninguém este mês"} />
        <Indicador rotulo="Experiência vencendo" icon={CalendarClock} cor={experiencias.length ? "ambar" : "verde"} valor={String(experiencias.length)}
          sub={experiencias.length ? experiencias.map(({ f, e }) => `${nomeCurto(f)}: ${e!.rotulo} em ${dataBR(e!.fim)}`).join("; ") : "nada nos próximos 15 dias"} />
      </div>

      <CrudPage<Funcionario>
        title="Funcionários"
        table="funcionarios"
        marcadores={["funcionário", "funcionários"]}
        order="nome"
        plural="funcionários"
        anexos="funcionario"
        podeExcluir={papel === "admin"}
        defaults={{ nome: "", vinculo: "clt", situacao: "ativo", unidade_id: padrao, faz_assistencia: false, ativo: true, dia_pagamento: 5 }}
        searchKeys={["nome", "apelido", "cargo", "setor", "whatsapp", "email", "municipio"]}
        filtros={FILTROS}
        ordens={[
          { label: "Nome", comparar: (a, b) => a.nome.localeCompare(b.nome) },
          { label: "Mais tempo de casa", comparar: (a, b) => (a.data_admissao ?? "9999").localeCompare(b.data_admissao ?? "9999") },
          { label: "Maior salário", comparar: (a, b) => Number(b.salario ?? 0) - Number(a.salario ?? 0) },
        ]}
        extraActions={pode("contas_pagar") && <Button variant="secondary" onClick={() => setLancar(true)}><HandCoins size={16} /> Lançar salários</Button>}
        beforeSave={(r) => {
          // os sigilosos não vão para a tabela funcionarios: seguem depois, pela função que registra quem alterou
          const { __sigilo, cpf, rg, pis, ctps, cnh, banco, agencia, conta, pix, ...resto } = r;
          const s = __sigilo as EstadoSigilo | undefined;
          const errado = CAMPOS_SIGILO.find((c) => erroSigilo(c, s?.valores[c.k]));
          if (errado) throw new Error(`Confira o ${errado.rotulo}: ${erroSigilo(errado, s!.valores[errado.k])}`);
          return {
            ...resto, uf: r.uf?.toUpperCase() || null,
            salario: r.salario === "" || r.salario == null ? null : Number(r.salario),
            dia_pagamento: r.dia_pagamento === "" || r.dia_pagamento == null ? null : Number(r.dia_pagamento),
          };
        }}
        afterSave={async (salvo, editado) => {
          const s = editado.__sigilo as EstadoSigilo | undefined;
          if (!s?.alterado) return;
          const { error } = await supabase.rpc("funcionario_sigilo_salvar", { p_funcionario: salvo.id, p_dados: s.valores });
          if (error) throw error;
          invalidar("funcionarios_sigilo_resumo");
        }}
        onFieldChange={async (name, value, _row, forcar) => (name === "cep" && (forcar || String(value ?? "").replace(/\D/g, "").length === 8) ? completarPorCep(value, forcar) : null)}
        exportExtra={(f) => ({ "Tempo de casa": tempoDeCasa(f.data_admissao) ?? "" })}
        fields={fields}
        cartaoCelular={(f, abrir) => (
          <button type="button" onClick={abrir} className="block w-full pr-8 text-left">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-fg">{f.nome}</span>
              <Badge value={f.situacao} />
            </span>
            <span className="block text-sm text-slate-600">{[f.cargo, f.setor, f.unidade_id && codigo(f.unidade_id)].filter(Boolean).join(" · ") || "—"}</span>
            <span className="mt-1 block text-xs text-slate-500">
              {rotuloVinculo(f.vinculo)}{f.data_admissao && ` · desde ${dataBR(f.data_admissao)} (${tempoDeCasa(f.data_admissao)})`}{f.faz_assistencia && " · técnico"}
            </span>
          </button>
        )}
        columns={[
          { label: "Nome", render: (f) => <><span className="font-semibold text-fg">{f.nome}</span>{f.apelido && <span className="text-slate-500"> ({f.apelido})</span>}
            <span className="block text-xs text-slate-500">{f.cargo ?? "—"}{f.faz_assistencia && " · técnico"}</span></> },
          { label: "Setor", render: (f) => [f.setor, f.unidade_id && codigo(f.unidade_id)].filter(Boolean).join(" · ") || "—" },
          { label: "Vínculo", render: (f) => rotuloVinculo(f.vinculo) },
          { label: "Admissão", render: (f) => f.data_admissao ? <>{dataBR(f.data_admissao)}<span className="block text-xs text-slate-500">{tempoDeCasa(f.data_admissao)}</span></> : "—" },
          { label: "Situação", render: (f) => <Badge value={f.situacao} /> },
          { label: "CPF", render: (f) => resumo.get(f.id)?.cpf
            ? <span className="inline-flex items-center gap-1 font-mono text-sm" title="Parcial: abra o cadastro para ver inteiro"><Lock size={12} className="text-slate-400" aria-hidden />{resumo.get(f.id)!.cpf}</span>
            : <span className="text-slate-400">—</span> },
          { label: "Contato", render: (f) => <Contato r={f} mensagem={`Olá, ${nomeCurto(f).split(" ")[0]}!`} /> },
        ]}
      />
      {lancar && <LancarSalarios funcionarios={equipe} onClose={() => setLancar(false)} />}
    </div>
  );
}

/** Contas a pagar do mês, uma por pessoa da equipe com salário; as já lançadas (mesmo documento) ficam de fora. */
function LancarSalarios({ funcionarios, onClose }: { funcionarios: Funcionario[]; onClose: () => void }) {
  const { padrao } = useUnidade();
  const invalidar = useInvalidate();
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [ocupado, setOcupado] = useState(false);
  const comSalario = funcionarios.filter((f) => Number(f.salario) > 0);
  const documento = (f: Funcionario) => `RH-${mes}-${f.id.slice(0, 8)}`;
  const { data: lancadas = [] } = useRows<{ documento: string | null }>("contas_pagar", { select: "documento", key: ["rh"] });
  const jaTem = useMemo(() => new Set(lancadas.map((c) => c.documento).filter(Boolean)), [lancadas]);
  const novas = comSalario.filter((f) => !jaTem.has(documento(f)));
  const [a, m] = mes.split("-").map(Number);
  const vencimento = (f: Funcionario) => {
    // salário do mês é pago até o dia combinado do mês seguinte (CLT: até o 5º dia útil)
    const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
    const dia = Math.min(Number(f.dia_pagamento ?? 5), ultimo);
    return new Date(Date.UTC(a, m, dia)).toISOString().slice(0, 10);
  };
  const rotulo = `${String(m).padStart(2, "0")}/${a}`;
  const titulo = (f: Funcionario) => (f.vinculo === "socio" ? "Pró-labore" : f.vinculo === "pj" || f.vinculo === "autonomo" ? "Serviço" : "Salário");

  async function lancarContas() {
    setOcupado(true);
    try {
      const linhas = novas.map((f) => ({
        descricao: `${titulo(f)} ${rotulo} · ${nomeCurto(f)}`, categoria: categoriaDoVinculo(f.vinculo), valor: Number(f.salario),
        vencimento: vencimento(f), competencia: `${mes}-01`, status: "aberto", documento: documento(f), unidade_id: f.unidade_id ?? padrao,
        observacoes: "Lançado pelo cadastro de funcionários com o salário bruto: ajuste para o líquido da folha do contador.",
      }));
      const { error } = await supabase.from("contas_pagar").insert(linhas);
      if (error) throw error;
      notify(`${linhas.length} conta(s) lançada(s) em Contas a pagar`);
      invalidar("contas_pagar");
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title="Lançar salários no Contas a pagar">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">Mês trabalhado
        <CampoMes value={mes} onChange={(v) => v && setMes(v)} rotulo="Mês trabalhado" />
      </div>
      {!comSalario.length ? <p className="text-sm text-slate-600">Ninguém da equipe tem salário cadastrado.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {comSalario.map((f) => {
            const ja = jaTem.has(documento(f));
            return (
              <li key={f.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${ja ? "text-slate-400" : ""}`}>
                <span className="min-w-0">{titulo(f)} · <b>{nomeCurto(f)}</b> <span className="text-xs text-slate-500">({categoriaDoVinculo(f.vinculo)})</span></span>
                <span className="num whitespace-nowrap">{ja ? "já lançado" : <>{brl(Number(f.salario))} · vence {dataBR(vencimento(f))}</>}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">Valor bruto do contrato. Quando o contador mandar a folha, ajuste cada conta para o líquido (e lance INSS/FGTS pelas guias).</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={ocupado || !novas.length} onClick={lancarContas}>
          {ocupado ? "Lançando…" : novas.length ? `Lançar ${novas.length} conta(s) · ${brl(novas.reduce((s, f) => s + Number(f.salario), 0))}` : "Tudo já lançado"}
        </Button>
      </div>
    </Modal>
  );
}
