// Ficha do cliente 360°: tudo o que o cliente já fez com a empresa numa tela só. Compras (pedidos do ERP e notas
// do sistema anterior), o que costuma comprar, como paga, assistência e equipamentos, atendimentos registrados,
// preferências e o que fazer agora (cobrar, chamar de volta, oferecer reposição, agendar preventiva).
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CalendarDays, Clock, Info, Lightbulb, Link2, MessageSquarePlus, Receipt, Repeat, Save, TrendingUp, Wallet, XCircle } from "lucide-react";
import { Badge, Button, Field, Indicador, Modal, Tabs, type CorCartao } from "@/components/ui";
import { Contato } from "@/components/Contato";
import { DEMO, supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { brl, dataBR, digitos, docFormat, hoje, situacaoConta, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { comprasDoCliente, produtosDoCliente, resumoCliente, ROTULO_SITUACAO, sugestoesCliente } from "@/lib/fichaCliente";
import { textoVenda } from "@/lib/garantia";
import { MaquinasCliente } from "@/components/clientes/MaquinasCliente";
import type { Cliente } from "@/lib/types";
import { ReceitaCliente } from "@/components/clientes/QualidadeClientes";
import { DetalheProposta, SeloEmpresa, SeloSituacao } from "@/components/vendas/PropostasTiny";
import type { PropostaTiny } from "@/lib/propostasTiny";

type Aba = "resumo" | "compras" | "produtos" | "financeiro" | "assistencia" | "atendimentos";

const NOTA = "id, numero, serie, status, ambiente, finalidade, tipo_operacao, pedido_id, valor_total, created_at, payload, origem";
const TIPOS: Record<string, string> = { pos_venda: "Pós-venda", cobranca: "Cobrança", preventiva: "Preventiva", garantia: "Garantia", outro: "Atendimento" };
const CANAIS: Record<string, string> = { whatsapp: "WhatsApp", telefone: "Telefone", email: "E-mail", visita: "Visita", loja: "Na loja" };
const ICONE = { erro: { Icon: XCircle, cor: "text-red-600" }, alerta: { Icon: AlertTriangle, cor: "text-amber-600" }, info: { Icon: Info, cor: "text-sky-600" } };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
// a parcela só entra se a descrição ainda não diz qual é (ex.: "Pedido #101 - parcela 3/3")
const descricaoConta = (x: any) => {
  const parc = `${x.parcela}/${x.total_parcelas}`;
  return x.total_parcelas > 1 && !String(x.descricao ?? "").includes(parc) ? `${x.descricao} (${parc})` : x.descricao;
};
const pagamentoConta = (x: any) => {
  const atraso = x.status === "pago" && x.data_pagamento ? diasEntre(x.vencimento, x.data_pagamento) : 0;
  return `${dataBR(x.data_pagamento)}${atraso > 0 ? ` · ${atraso} ${pl(atraso, "dia", "dias")} de atraso` : ""}`;
};

/** Linha dos cartões do celular: texto à esquerda (quebra linha) e valor à direita (nunca quebra). */
function Linha({ esq, dir }: { esq: ReactNode; dir: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 [overflow-wrap:anywhere]">{esq}</span>
      <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{dir}</span>
    </div>
  );
}

function useFicha(c: Cliente) {
  return useQuery({
    queryKey: ["ficha_cliente", c.id],
    queryFn: async () => {
      const doc = digitos(c.cpf_cnpj);
      const vazio = Promise.resolve({ data: [] as any[] });
      const [ped, notasC, notasD, contas, oss, equip, contatos, usuarios, legado, propostasTiny] = await Promise.all([
        supabase.from("pedidos").select("id, numero, status, valor_total, created_at, aprovado_em, vendedor, proposta_status, motivo_rejeicao, motivo_rejeicao_texto, " +
          "itens:pedido_itens(produto_id, descricao, quantidade, valor_unitario, produto:produtos(sku)), notas:notas_fiscais(id, numero, status, ambiente)")
          .eq("cliente_id", c.id).order("created_at", { ascending: false }),
        supabase.from("notas_fiscais").select(NOTA).eq("cliente_id", c.id),
        doc.length >= 11 ? supabase.from("notas_fiscais").select(NOTA).eq("destinatario_doc", doc) : vazio,
        supabase.from("contas_receber").select("id, descricao, valor, valor_pago, vencimento, status, data_pagamento, parcela, total_parcelas")
          .eq("cliente_id", c.id).order("vencimento", { ascending: false }),
        supabase.from("ordens_servico").select("id, numero, equipamento, numero_serie, defeito_relatado, status, em_garantia, valor_total, data_entrada")
          .eq("cliente_id", c.id).order("data_entrada", { ascending: false }),
        supabase.from("equipamentos").select("id, cliente_id, descricao, numero_serie, data_venda, garantia_ate, proxima_preventiva, preventiva_agendada, origem, usada")
          .eq("cliente_id", c.id).order("data_venda", { ascending: false, nullsFirst: false }),
        supabase.from("contatos_cliente").select("id, tipo, canal, resultado, proximo_contato, created_at, created_by")
          .eq("cliente_id", c.id).order("created_at", { ascending: false }),
        supabase.from("usuarios_erp").select("user_id, nome"),
        // o que comprou na My Frost (empresa anterior), trazido do backup do Tiny: só data, item e quantidade
        supabase.from("compras_legado").select("id, data, documento, descricao, quantidade, origem").eq("cliente_id", c.id).order("data", { ascending: false }),
        // propostas do Tiny (MF com valores; My Frost, a empresa anterior, sem valores)
        supabase.from("propostas_tiny").select("*").eq("cliente_id", c.id).order("data", { ascending: false }),
      ]);
      const erro = [ped, notasC, contas, oss, equip, contatos].find((r) => r.error)?.error;
      if (erro) throw erro;
      // a mesma nota pode vir pelo cliente e pelo CPF/CNPJ; as excluídas já ficam de fora pelo RLS
      const notas = [...new Map([...(notasC.data ?? []), ...(notasD.data ?? [])].map((n: any) => [n.id, n])).values()];
      return {
        pedidos: (ped.data ?? []) as any[], notas, contas: (contas.data ?? []) as any[], oss: (oss.data ?? []) as any[],
        equipamentos: (equip.data ?? []) as any[], contatos: (contatos.data ?? []) as any[],
        // antes da migração a tabela não existe: a ficha abre sem essa parte
        legado: (legado.error ? [] : legado.data ?? []) as any[],
        propostasTiny: (propostasTiny.error ? [] : propostasTiny.data ?? []) as PropostaTiny[],
        nomes: new Map(((usuarios.data ?? []) as any[]).map((u) => [u.user_id, u.nome])),
      };
    },
  });
}

export function FichaCliente({ cliente: c, onClose }: { cliente: Cliente; onClose: () => void }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("resumo");
  const { data, isLoading, error } = useFicha(c);
  const dia = hoje();

  const calc = useMemo(() => {
    if (!data) return null;
    const compras = comprasDoCliente(data.pedidos, data.notas);
    const resumo = resumoCliente(compras, data.contas, dia);
    const produtos = produtosDoCliente(compras);
    return { compras, resumo, produtos, sugestoes: sugestoesCliente(resumo, produtos, data.equipamentos, data.oss, dia) };
  }, [data, dia]);

  const nome = c.nome_fantasia?.trim() || c.nome;
  return (
    <Modal open onClose={onClose} title={`Ficha 360 · ${nome}`} wide>
      {/* no celular tudo quebra linha: nada pode passar da largura da janela (senão ela desliza para os lados) */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 [overflow-wrap:anywhere]">
        <div className="min-w-0 text-sm text-slate-600">
          <div className="font-semibold text-fg">{c.nome}{c.codigo ? <span className="ml-2 whitespace-nowrap font-mono text-xs text-slate-500">cód. {c.codigo}</span> : null}</div>
          <div>{[docFormat(c.cpf_cnpj), [c.municipio, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "—"}</div>
          {data && <MaquinasCliente maquinas={data.equipamentos} max={8} />}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {calc && <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${ROTULO_SITUACAO[calc.resumo.situacao].cor}`}>{ROTULO_SITUACAO[calc.resumo.situacao].rotulo}</span>}
          <div className="min-w-0"><Contato r={c} mensagem={`Olá, ${nome.split(" ")[0]}! Aqui é da MF Máquinas.`} /></div>
          {c.portal_token && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button type="button" variant="ghost" title="Página do cliente: contas em aberto, Pix e segunda via (sem login)"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/cliente/${c.portal_token}`).then(() => notify("Link da página do cliente copiado"))}>
                <Link2 size={15} /> Link do cliente
              </Button>
              <a href={`/cliente/${c.portal_token}`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-sm font-semibold text-brand hover:underline"
                onClick={(e) => { if (DEMO) { e.preventDefault(); navigate(`/cliente/${c.portal_token}`); } }}>Ver como o cliente vê</a>
            </div>
          )}
        </div>
      </div>

      <Tabs value={aba} onChange={setAba} options={[
        { value: "resumo", label: "Resumo" },
        { value: "compras", label: `Compras${calc ? ` (${calc.compras.length})` : ""}` },
        { value: "produtos", label: "O que compra" },
        { value: "financeiro", label: "Financeiro" },
        { value: "assistencia", label: `Assistência${data ? ` (${data.oss.length})` : ""}` },
        { value: "atendimentos", label: `Atendimentos${data ? ` (${data.contatos.length})` : ""}` },
      ]} />

      {isLoading && <p className="py-8 text-center text-slate-500">Carregando a ficha…</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar a ficha: {(error as Error).message}</p>}
      {data && calc && (
        <>
          {aba === "resumo" && <Resumo c={c} r={calc.resumo} sugestoes={calc.sugestoes} />}
          {aba === "compras" && <Compras compras={calc.compras} pedidos={data.pedidos} propostasTiny={data.propostasTiny} />}
          {aba === "produtos" && <Produtos produtos={calc.produtos} />}
          {aba === "financeiro" && <Financeiro contas={data.contas} r={calc.resumo} />}
          {aba === "assistencia" && <Assistencia oss={data.oss} equipamentos={data.equipamentos} legado={data.legado} />}
          {aba === "atendimentos" && <Atendimentos cliente={c} contatos={data.contatos} nomes={data.nomes} />}
        </>
      )}
    </Modal>
  );
}

/** Situação vira cor do cartão: ruim = vermelho, atenção = âmbar, bom = verde; sem situação fica a cor do assunto. */
const corSituacao = (tom: "bom" | "ruim" | "atencao" | undefined, assunto: CorCartao): CorCartao =>
  tom === "ruim" ? "vermelho" : tom === "atencao" ? "ambar" : tom === "bom" ? "verde" : assunto;

function Resumo({ c, r, sugestoes }: { c: Cliente; r: ReturnType<typeof resumoCliente>; sugestoes: ReturnType<typeof sugestoesCliente> }) {
  const { pode } = usePerfil();
  const invalidate = useInvalidate();
  const [pref, setPref] = useState(c.preferencias ?? "");
  const [salvando, setSalvando] = useState(false);
  const podeEditar = pode("editar_clientes");

  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await supabase.from("clientes").update({ preferencias: pref.trim() || null }).eq("id", c.id);
      if (error) throw error;
      notify("Preferências salvas");
      invalidate("clientes", "ficha_cliente");
    } catch (e) {
      notifyError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Indicador rotulo="Total comprado" icon={Wallet} cor="azul" valor={brl(r.total)} sub={r.primeira ? `cliente desde ${dataBR(r.primeira)}` : "sem compras"} />
        <Indicador rotulo="Últimos 12 meses" icon={TrendingUp} cor="indigo" valor={brl(r.ultimos12m)} sub={`${r.compras} ${pl(r.compras, "compra", "compras")} no total`} />
        <Indicador rotulo="Ticket médio" icon={Receipt} cor="roxo" valor={brl(r.ticket)} />
        <Indicador rotulo="Última compra" icon={CalendarDays} valor={r.ultima ? dataBR(r.ultima) : "—"} sub={r.semComprar !== null ? `há ${r.semComprar} dias` : undefined}
          cor={corSituacao(r.situacao === "inativo" ? "ruim" : r.situacao === "em_risco" ? "atencao" : r.ultima ? "bom" : undefined, "neutro")} />
        <Indicador rotulo="Compra a cada" icon={Repeat} cor="neutro" valor={r.intervaloMedio ? `${r.intervaloMedio} dias` : "—"}
          sub={r.proximaPrevista ? `próxima prevista: ${dataBR(r.proximaPrevista)}` : "precisa de 2 compras ou mais"} />
        <Indicador rotulo="Em aberto" icon={Clock} cor={r.emAberto > 0 ? "laranja" : "neutro"} valor={brl(r.emAberto)} />
        <Indicador rotulo="Vencido" icon={r.vencido > 0 ? AlertTriangle : BadgeCheck} valor={brl(r.vencido)} sub={r.vencidas ? `${r.vencidas} ${pl(r.vencidas, "parcela", "parcelas")}` : "nada vencido"}
          cor={corSituacao(r.vencido > 0 ? "ruim" : "bom", "neutro")} />
        <Indicador rotulo="Pontualidade" icon={BadgeCheck} valor={r.pagas ? `${r.pagas - r.pagasComAtraso} de ${r.pagas} em dia` : "—"}
          sub={r.pagasComAtraso ? `atraso médio de ${r.atrasoMedio} dias` : undefined} cor={corSituacao(r.pagasComAtraso > 1 ? "atencao" : r.pagas ? "bom" : undefined, "neutro")} />
      </div>

      <ReceitaCliente c={c} />

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lightbulb size={16} className="text-amber-500" /> O que fazer com este cliente</h3>
        {!sugestoes.length ? <p className="text-sm text-slate-500">Nada pendente: cliente em dia.</p> : (
          <ul className="space-y-1.5">
            {sugestoes.map((s, i) => {
              const { Icon, cor } = ICONE[s.nivel];
              return <li key={i} className="flex gap-2 text-sm"><Icon size={16} className={`mt-0.5 shrink-0 ${cor}`} aria-hidden /> <span>{s.texto}</span></li>;
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Preferências (como gosta de ser atendido, forma de pagamento, linhas que trabalha…)">
          <textarea className="input min-h-[90px]" value={pref} onChange={(e) => setPref(e.target.value)} disabled={!podeEditar}
            placeholder="Ex.: prefere WhatsApp à tarde; paga no boleto 28 dias; trabalha com gelato e açaí" />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Observações do cadastro</span>
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700 [overflow-wrap:anywhere]">{c.observacoes || "—"}</p>
        </div>
      </div>
      {podeEditar && pref !== (c.preferencias ?? "") && (
        <Button type="button" onClick={salvar} disabled={salvando}><Save size={16} /> {salvando ? "Salvando…" : "Salvar preferências"}</Button>
      )}
    </div>
  );
}

function Compras({ compras, pedidos, propostasTiny }: { compras: ReturnType<typeof comprasDoCliente>; pedidos: any[]; propostasTiny: PropostaTiny[] }) {
  const orcamentos = pedidos.filter((p) => ["orcamento", "cancelado"].includes(p.status));
  const [proposta, setProposta] = useState<PropostaTiny | null>(null);
  return (
    <div className="space-y-5">
      {!compras.length ? <p className="text-sm text-slate-500">Nenhuma compra registrada (pedidos aprovados ou notas de venda).</p> : (<>
        <ul className="divide-y divide-slate-100 text-sm sm:hidden">
          {compras.map((x, i) => (
            <li key={i} className="py-2">
              <Linha esq={<span className="font-semibold">{x.ref}</span>} dir={brl(x.valor)} />
              <div className="text-xs text-slate-500">{dataBR(x.data)}{x.origem === "nota" && " · sistema anterior"}</div>
              {x.itens.length > 0 && <div className="mt-0.5 text-slate-600">{x.itens.map((it) => `${it.quantidade}× ${it.descricao}`).join("; ")}</div>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Data</th><th>Documento</th><th>Itens</th><th className="text-right">Valor</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {compras.map((x, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap py-1.5">{dataBR(x.data)}</td>
                  <td className="whitespace-nowrap">{x.ref}{x.origem === "nota" && <span className="ml-1 text-xs text-slate-400">(sistema anterior)</span>}</td>
                  <td className="text-slate-600">{x.itens.map((it) => `${it.quantidade}× ${it.descricao}`).join("; ") || "—"}</td>
                  <td className="whitespace-nowrap text-right font-semibold">{brl(x.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
      {orcamentos.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Orçamentos e propostas que não viraram venda</h3>
          <ul className="space-y-1.5 text-sm">
            {orcamentos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">#{p.numero}</span> <span className="text-slate-500">{dataBR(p.created_at)}</span>
                <Badge value={p.status} /> {p.proposta_status && <Badge value={p.proposta_status} />}
                <span className="font-semibold">{brl(p.valor_total)}</span>
                {(p.motivo_rejeicao || p.motivo_rejeicao_texto) && <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">· motivo: {[p.motivo_rejeicao, p.motivo_rejeicao_texto].filter(Boolean).join(" — ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {propostasTiny.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Propostas do Tiny ({propostasTiny.length})</h3>
          <p className="mb-2 text-xs text-slate-500">Histórico do Tiny. As da My Frost (empresa anterior) ficam sem valores: não são vendas da MF.</p>
          <ul className="space-y-1.5 text-sm">
            {propostasTiny.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setProposta(p)} className="flex w-full flex-wrap items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50">
                  <span className="font-semibold">#{p.numero ?? "—"}</span> <SeloEmpresa e={p.empresa} /> <span className="text-slate-500">{dataBR(p.data)}</span>
                  <SeloSituacao s={p.situacao} />
                  {p.empresa === "mf" && <span className="font-semibold">{brl(p.total)}</span>}
                  <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{p.itens.map((i) => i.descricao).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposta && <DetalheProposta p={proposta} onClose={() => setProposta(null)} />}
    </div>
  );
}

function Produtos({ produtos }: { produtos: ReturnType<typeof produtosDoCliente> }) {
  if (!produtos.length) return <p className="text-sm text-slate-500">Ainda sem produtos comprados.</p>;
  return (<>
    <ul className="divide-y divide-slate-100 text-sm sm:hidden">
      {produtos.map((p, i) => (
        <li key={i} className="py-2">
          <Linha esq={p.descricao} dir={brl(p.valor)} />
          <div className="text-xs text-slate-500">
            {p.vezes} {p.vezes === 1 ? "vez" : "vezes"} · {p.quantidade.toLocaleString("pt-BR")} un. · última em {dataBR(p.ultima)}
          </div>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Produto</th><th className="text-right">Vezes</th><th className="text-right">Quantidade</th><th className="text-right">Total</th><th className="text-right">Última</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {produtos.map((p, i) => (
            <tr key={i}>
              <td className="py-1.5">{p.descricao}</td>
              <td className="text-right">{p.vezes}</td>
              <td className="text-right">{p.quantidade.toLocaleString("pt-BR")}</td>
              <td className="whitespace-nowrap text-right font-semibold">{brl(p.valor)}</td>
              <td className="whitespace-nowrap text-right">{dataBR(p.ultima)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>);
}

function Financeiro({ contas, r }: { contas: any[]; r: ReturnType<typeof resumoCliente> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Indicador rotulo="Em aberto" icon={Clock} cor={r.emAberto > 0 ? "laranja" : "neutro"} valor={brl(r.emAberto)} />
        <Indicador rotulo="Vencido" icon={r.vencido > 0 ? AlertTriangle : BadgeCheck} valor={brl(r.vencido)} cor={corSituacao(r.vencido > 0 ? "ruim" : "bom", "neutro")} />
        <Indicador rotulo="Pagas com atraso" icon={Receipt} valor={`${r.pagasComAtraso} de ${r.pagas}`} cor={corSituacao(r.pagasComAtraso > 1 ? "atencao" : undefined, "azul")} />
        <Indicador rotulo="Atraso médio" icon={CalendarDays} cor="neutro" valor={r.atrasoMedio ? `${r.atrasoMedio} dias` : "—"} />
      </div>
      {!contas.length ? <p className="text-sm text-slate-500">Nenhuma conta a receber deste cliente.</p> : (<>
        <ul className="divide-y divide-slate-100 text-sm sm:hidden">
          {contas.map((x) => (
            <li key={x.id} className="py-2">
              <Linha esq={<span>vence <b>{dataBR(x.vencimento)}</b></span>} dir={brl(x.valor)} />
              <div className="text-slate-600">{descricaoConta(x)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <Badge value={situacaoConta(x.status, x.vencimento)} />
                {x.data_pagamento && <span>pago em {pagamentoConta(x)}</span>}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Vencimento</th><th>Descrição</th><th className="text-right">Valor</th><th className="pl-4">Situação</th><th>Pagamento</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {contas.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap py-1.5">{dataBR(x.vencimento)}</td>
                  <td>{descricaoConta(x)}</td>
                  <td className="whitespace-nowrap text-right font-semibold">{brl(x.valor)}</td>
                  <td className="pl-4"><Badge value={situacaoConta(x.status, x.vencimento)} /></td>
                  <td className="whitespace-nowrap">{x.data_pagamento ? pagamentoConta(x) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

function Assistencia({ oss, equipamentos, legado }: { oss: any[]; equipamentos: any[]; legado: any[] }) {
  const dia = hoje();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Equipamentos do cliente</h3>
        {!equipamentos.length ? <p className="text-sm text-slate-500">Nenhum equipamento registrado.</p> : (
          <ul className="space-y-1.5 text-sm">
            {equipamentos.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 [overflow-wrap:anywhere]">
                <b>{e.descricao}</b>{e.numero_serie && <span className="text-slate-500">série {e.numero_serie}</span>}
                <span className={e.origem ? "text-amber-800" : ""}>{textoVenda(e)}</span>
                {e.usada && <span className="font-semibold text-emerald-700">usada</span>}
                {e.garantia_ate && <span className={e.garantia_ate < dia ? "text-slate-500" : "text-emerald-700"}>garantia {e.garantia_ate < dia ? "terminou" : "até"} {dataBR(e.garantia_ate)}</span>}
                {e.proxima_preventiva && <span className={e.proxima_preventiva < dia ? "text-red-700" : ""}>preventiva {dataBR(e.proxima_preventiva)}{e.preventiva_agendada ? ` (agendada ${dataBR(e.preventiva_agendada)})` : ""}</span>}
              </li>
            ))}
          </ul>
        )}
        {equipamentos.some((e) => e.origem) && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            {[...new Set(equipamentos.filter((e) => e.origem).map((e) => e.origem))].join(", ")} é outra empresa. Nas máquinas vendidas por ela a MF não dá
            garantia de fábrica: responde só pelo serviço e pelas peças que fornecer, com OS e orçamento aprovado.
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Ordens de serviço</h3>
        {!oss.length ? <p className="text-sm text-slate-500">Nenhuma OS deste cliente.</p> : (
          <ul className="space-y-2 text-sm">
            {oss.map((o) => (
              <li key={o.id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <b>OS #{o.numero}</b> <span className="text-slate-500">{dataBR(o.data_entrada)}</span> <Badge value={o.status} />
                  {o.em_garantia && <span className="text-xs font-semibold text-emerald-700">garantia</span>}
                  <span className="ml-auto font-semibold">{brl(o.valor_total)}</span>
                </div>
                <div className="text-slate-600 [overflow-wrap:anywhere]">{o.equipamento}{o.numero_serie ? ` (série ${o.numero_serie})` : ""}: {o.defeito_relatado}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {legado.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Compras na My Frost (empresa anterior)</h3>
          <p className="mb-2 text-xs text-slate-500">Do backup do Tiny da My Frost: ajuda a saber que peças essa máquina já usou. Não são vendas da MF.</p>
          <ul className="space-y-1 text-sm">
            {legado.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-x-3 [overflow-wrap:anywhere]">
                <span className="num text-slate-500">{dataBR(x.data)}</span>
                <span>{Number(x.quantidade) !== 1 ? `${Number(x.quantidade).toLocaleString("pt-BR")} × ` : ""}{x.descricao}</span>
                {x.documento && <span className="text-xs text-slate-500">{x.documento}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Atendimentos({ cliente, contatos, nomes }: { cliente: Cliente; contatos: any[]; nomes: Map<string, string> }) {
  const { pode } = usePerfil();
  const invalidate = useInvalidate();
  const [f, setF] = useState({ tipo: "outro", canal: "whatsapp", resultado: "", proximo_contato: "" });
  const [salvando, setSalvando] = useState(false);
  const podeRegistrar = pode("editar_clientes");

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (f.resultado.trim().length < 3) return notify("Escreva o que foi conversado", "erro");
    setSalvando(true);
    try {
      const { error } = await supabase.from("contatos_cliente").insert({
        cliente_id: cliente.id, tipo: f.tipo, canal: f.canal, resultado: f.resultado.trim(), proximo_contato: f.proximo_contato || null,
      });
      if (error) throw error;
      notify("Atendimento registrado");
      setF({ ...f, resultado: "", proximo_contato: "" });
      invalidate("ficha_cliente", "contatos_cliente");
    } catch (err) {
      notifyError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      {podeRegistrar && (
        <form onSubmit={registrar} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
          <Field label="Assunto">
            <select className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Como">
            <select className="input" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
              {Object.entries(CANAIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Retornar em (opcional)" className="md:col-span-2">
            <input type="date" className="input" value={f.proximo_contato} min={hoje()} onChange={(e) => setF({ ...f, proximo_contato: e.target.value })} />
          </Field>
          <Field label="O que foi conversado" className="md:col-span-4">
            <textarea className="input min-h-[70px]" value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })}
              placeholder="Ex.: pediu orçamento de 2 máquinas para dezembro; ligar de novo dia 15" />
          </Field>
          <div className="md:col-span-4"><Button type="submit" disabled={salvando}><MessageSquarePlus size={16} /> {salvando ? "Registrando…" : "Registrar atendimento"}</Button></div>
        </form>
      )}
      {!contatos.length ? <p className="text-sm text-slate-500">Nenhum atendimento registrado ainda.</p> : (
        <ol className="space-y-2">
          {contatos.map((x) => (
            <li key={x.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-fg">{TIPOS[x.tipo] ?? x.tipo}</span>
                <span>{CANAIS[x.canal] ?? x.canal}</span>
                <span>{new Date(x.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                {x.created_by && nomes.get(x.created_by) && <span>por {nomes.get(x.created_by)}</span>}
                {x.proximo_contato && <span className={x.proximo_contato < hoje() ? "font-semibold text-red-700" : "text-sky-700"}>retornar em {dataBR(x.proximo_contato)}</span>}
              </div>
              {x.resultado && <p className="mt-1 whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]">{x.resultado}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
