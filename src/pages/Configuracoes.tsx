import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { Button, Card, Field, PageHeader } from "@/components/ui";
import { limpar, useSave } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { AvisosConfig } from "@/components/Avisos";
import { CatalogoConfig } from "@/components/CatalogoConfig";
import { UnidadesConfig } from "@/components/UnidadesConfig";
import { EmailConfig } from "@/components/EmailConfig";
import { ImportarTiny } from "@/components/ImportarTiny";
import { useUnidade } from "@/lib/unidade";

export default function Configuracoes() {
  const { data } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
  const save = useSave("configuracoes");
  const { unidades } = useUnidade();
  const [cfg, setCfg] = useState<Record<string, any> | null>(null);
  useEffect(() => { if (data) setCfg(data); }, [data]);

  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const set = (k: string) => (e: { target: { value: string } }) => setCfg({ ...cfg, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      // campos dos avisos são salvos na hora pelo próprio painel de avisos
      const { updated_at: _u, telegram_bot: _t, avisos_email_ativo: _a, email_responder_para: _r, ...row } = cfg!;
      await save.mutateAsync(limpar({
        ...row,
        uf: row.uf?.toUpperCase(),
        regime_tributario: Number(row.regime_tributario),
        presenca_comprador: Number(row.presenca_comprador),
        dias_vencimento_boleto: Number(row.dias_vencimento_boleto),
        multa_percentual: Number(row.multa_percentual),
        juros_percentual_mes: Number(row.juros_percentual_mes),
        validade_orcamento_dias: Number(row.validade_orcamento_dias),
        garantia_meses_padrao: Number(row.garantia_meses_padrao),
        preventiva_meses: Number(row.preventiva_meses),
        comissao_percentual: Number(row.comissao_percentual),
        updated_at: new Date().toISOString(),
      }));
      notify("Configurações salvas");
    } catch (err) {
      notifyError(err);
    }
  }

  const input = (k: string, label: string, cls = "", type = "text") => (
    <Field label={label} className={cls}><input className="input" type={type} step={type === "number" ? "any" : undefined} value={cfg[k] ?? ""} onChange={set(k)} /></Field>
  );

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Configurações" actions={<Button form="form-config" disabled={save.isPending}>Salvar</Button>} />
      <Card className="p-4"><UnidadesConfig /></Card>
    <form id="form-config" onSubmit={salvar} className="space-y-5">

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Empresa (dados gerais)</h2>
        <p className="mb-3 text-sm text-slate-500">Aparecem nos PDFs, nos e-mails e na vitrine. CNPJ, IE e endereço de cada unidade ficam em Unidades, acima.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {input("razao_social", "Razão social", "sm:col-span-2")}
          {input("nome_fantasia", "Nome fantasia", "sm:col-span-2")}
          {input("cnpj", "CNPJ")}
          {input("inscricao_estadual", "Inscrição estadual")}
          {input("municipio", "Município")}
          {input("uf", "UF")}
          {input("whatsapp", "WhatsApp comercial")}
          {input("endereco", "Endereço (aparece nos PDFs)", "sm:col-span-2")}
          {input("telefone", "Telefone")}
          {input("email", "E-mail")}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Orçamentos, garantia e comissão</h2>
        <p className="mb-3 text-sm text-slate-500">Usados nos PDFs, no cálculo da garantia das máquinas vendidas e no relatório de comissões.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {input("validade_orcamento_dias", "Validade do orçamento (dias)", "", "number")}
          {input("garantia_meses_padrao", "Garantia padrão (meses)", "", "number")}
          {input("preventiva_meses", "Preventiva a cada (meses)", "", "number")}
          {input("comissao_percentual", "Comissão dos vendedores (%)", "", "number")}
          <Field label="Termo de garantia (sai no orçamento e no laudo)" className="sm:col-span-4">
            <textarea className="input" rows={3} value={cfg.termo_garantia ?? ""} onChange={set("termo_garantia")} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">NF-e (geral)</h2>
        <p className="mb-3 text-sm text-slate-500">CFOP, CST e alíquotas do lucro real ficam em cada unidade (botão Editar → Impostos).</p>
        <Field label="Presença do comprador" className="max-w-sm">
          <select className="input" value={cfg.presenca_comprador} onChange={set("presenca_comprador")}>
            <option value={1}>1 - Presencial</option>
            <option value={2}>2 - Internet</option>
            <option value={3}>3 - Teleatendimento</option>
            <option value={9}>9 - Outros (não presencial)</option>
          </select>
        </Field>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Contador</h2>
        <p className="mb-3 text-sm text-slate-500">
          Para o contador entrar no ERP (só consulta), crie um usuário com o papel <b>Contador</b> em Usuários. Aqui fica o envio automático do fechamento.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {input("contador_nome", "Nome do contador / escritório", "sm:col-span-2")}
          {input("contador_email", "E-mail do contador", "sm:col-span-2", "email")}
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="h-5 w-5" checked={!!cfg.contador_envio_auto} onChange={(e) => setCfg({ ...cfg, contador_envio_auto: e.target.checked })} />
            Enviar sozinho, todo mês, o pacote do mês anterior (XML + planilhas) por e-mail
          </label>
          <Field label="Dia do envio">
            <select className="input" value={cfg.contador_envio_dia ?? 5} onChange={(e) => setCfg({ ...cfg, contador_envio_dia: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Automação de pedidos</h2>
        <p className="mb-3 text-sm text-slate-500">O que o ERP faz sozinho depois que a venda é aprovada (no ERP, na loja virtual ou pela proposta).</p>
        <label className="mb-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!cfg.nfe_automatica} onChange={(e) => setCfg({ ...cfg, nfe_automatica: e.target.checked })} />
          <span><b>Emitir a NF-e automaticamente</b> quando o pedido for aprovado (na hora pelo ERP; pedidos da loja e propostas em até 15 minutos). Se o cadastro tiver erro, a nota não sai e aparece em Compliance fiscal.</span>
        </label>
        <label className="mb-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!cfg.vender_sem_estoque} onChange={(e) => setCfg({ ...cfg, vender_sem_estoque: e.target.checked })} />
          <span><b>Aprovar venda sem estoque</b> (o estoque da unidade pode ficar negativo). Desligado, a aprovação é bloqueada e mostra o que falta; produtos marcados como <i>sob encomenda</i> passam sempre.</span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Etiquetas de envio" className="sm:col-span-2">
            <select className="input" value={cfg.etiqueta_formato ?? "10x15"} onChange={set("etiqueta_formato")}>
              <option value="10x15">10 x 15 cm (impressora térmica de etiquetas)</option>
              <option value="a4">Folha A4, 4 etiquetas por folha (impressora comum)</option>
            </select>
          </Field>
          <Field label="Pedido entra na expedição" className="sm:col-span-2">
            <select className="input" value={cfg.expedicao_apos ?? "nfe"} onChange={set("expedicao_apos")}>
              <option value="nfe">Quando a NF-e for autorizada</option>
              <option value="aprovacao">Logo que a venda é aprovada (separa enquanto a nota sai)</option>
            </select>
          </Field>
        </div>
        <h3 className="mb-1 mt-4 text-sm font-semibold">Custos do meio de pagamento (para a margem de contribuição)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([["cartao_pct", "Cartão (%)"], ["boleto_fixo", "Boleto (R$ por parcela)"], ["pix_pct", "Pix (%)"], ["transferencia_pct", "Transferência (%)"], ["dinheiro_pct", "Dinheiro (%)"]] as const).map(([k, l]) => (
            <Field key={k} label={l}>
              <input className="input" inputMode="decimal" value={cfg.custos_pagamento?.[k] ?? ""}
                onChange={(e) => setCfg({ ...cfg, custos_pagamento: { ...(cfg.custos_pagamento ?? {}), [k]: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) || 0 } })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Proposta comercial (layout)</h2>
        <p className="mb-3 text-sm text-slate-500">Vale para o PDF, o e-mail e a página que o cliente abre para aprovar.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {input("proposta_titulo", "Título", "sm:col-span-2")}
          <Field label="Cor da proposta">
            <div className="flex items-center gap-2">
              <input type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent" value={cfg.proposta_cor ?? "#0EA5E9"} onChange={set("proposta_cor")} />
              <span className="num text-sm text-slate-500">{cfg.proposta_cor}</span>
            </div>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={!!cfg.proposta_fotos} onChange={(e) => setCfg({ ...cfg, proposta_fotos: e.target.checked })} /> Mostrar fotos dos produtos
          </label>
          <Field label="Apresentação (aparece no começo)" className="sm:col-span-4"><textarea className="input" rows={3} value={cfg.proposta_apresentacao ?? ""} onChange={set("proposta_apresentacao")} /></Field>
          <Field label="Condições gerais (instalação, entrega, treinamento…)" className="sm:col-span-4"><textarea className="input" rows={3} value={cfg.proposta_condicoes ?? ""} onChange={set("proposta_condicoes")} /></Field>
          <Field label="Rodapé (opcional)" className="sm:col-span-4"><textarea className="input" rows={2} value={cfg.proposta_rodape ?? ""} onChange={set("proposta_rodape")} /></Field>
        </div>
      </Card>

      <Card className="p-4"><CatalogoConfig texto={cfg.catalogo_texto ?? ""} onTexto={(v) => setCfg({ ...cfg, catalogo_texto: v })} /></Card>

      {unidades.length > 1 && (
        <Card className="p-4">
          <h2 className="mb-1 font-semibold">Loja virtual</h2>
          <p className="mb-3 text-sm text-slate-500">Pedidos feitos pelos clientes na loja entram como orçamento nesta unidade.</p>
          <Field label="Unidade que recebe os pedidos da loja" className="max-w-sm">
            <select className="input" value={cfg.loja_unidade_id ?? ""} onChange={set("loja_unidade_id")}>
              <option value="">Matriz (padrão)</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
        </Card>
      )}

      <Card className="p-4"><AvisosConfig /></Card>

      <FocusNfeCard />

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Notas de fornecedores (automático)</h2>
        <p className="mb-3 text-sm text-slate-600">
          Quando chega uma NF-e de compra, o ERP dá ciência, lê o XML e faz o que estiver marcado abaixo. Remessas
          (ex.: máquina enviada para conserto) não entram: ficam em <i>revisão</i> para você decidir.
        </p>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={!!cfg.entrada_automatica_estoque}
            onChange={(e) => setCfg({ ...cfg, entrada_automatica_estoque: e.target.checked })} />
          Dar entrada no estoque automaticamente (itens já vinculados a um produto ou com o mesmo código de barras)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={!!cfg.conta_pagar_automatica}
            onChange={(e) => setCfg({ ...cfg, conta_pagar_automatica: e.target.checked })} />
          Lançar as parcelas (duplicatas) da nota em contas a pagar automaticamente
        </label>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold">Cobrança</h2>
        <p className="mb-3 text-sm text-slate-500">Os dados para pagamento (Pix, banco) de cada unidade ficam em Unidades, acima.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {input("dias_vencimento_boleto", "Dias para o 1º vencimento", "", "number")}
          {input("multa_percentual", "Multa por atraso (%)", "", "number")}
          {input("juros_percentual_mes", "Juros ao mês (%)", "", "number")}
        </div>
      </Card>
    </form>
      <Card className="p-4"><EmailConfig /></Card>
      <ImportarTiny />
      <BackupCard />
    </div>
  );
}

function BackupCard() {
  const [etapa, setEtapa] = useState("");
  async function baixar() {
    try {
      const { exportarTudo } = await import("@/lib/exportar");
      await exportarTudo(async (tabela, de, ate) => {
        const { data, error } = await supabase.from(tabela).select("*").range(de, ate);
        if (error) throw error;
        return data ?? [];
      }, setEtapa);
      notify("Planilha baixada");
    } catch (e) { notifyError(e); } finally { setEtapa(""); }
  }
  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Exportar todos os dados</h2>
      <p className="mb-3 text-sm text-slate-600">
        Baixa uma planilha do Excel com tudo do ERP: clientes, fornecedores, produtos, estoque, pedidos, OS, contas, notas e produção,
        uma aba para cada. Serve de cópia de segurança ou para mandar ao contador.
      </p>
      <Button type="button" variant="secondary" onClick={baixar} disabled={!!etapa}><FileDown size={16} /> {etapa ? `Lendo ${etapa}…` : "Baixar planilha completa"}</Button>
    </Card>
  );
}

type SituacaoFocus = {
  ambiente: string;
  eventos: string[];
  unidades?: { nome: string; cnpj: string; eventos: string[]; erro?: string }[];
  falhas?: { nome: string; mensagem: string }[];
};

function FocusNfeCard() {
  const [estado, setEstado] = useState<SituacaoFocus | null>(null);
  const [falhas, setFalhas] = useState<SituacaoFocus["falhas"]>([]);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function chamar(acao: "status" | "registrar") {
    setOcupado(true);
    setErro("");
    try {
      const r: SituacaoFocus = await callFunction("focus-config", { acao });
      setEstado((e) => ({ ...r, ambiente: r.ambiente ?? e?.ambiente ?? "" }));
      if (acao === "registrar") {
        setFalhas(r.falhas ?? []);
        notify(r.falhas?.length ? "Atualização automática ativada nas unidades liberadas na Focus" : "Atualização automática ativada na Focus NFe");
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => { chamar("status"); }, []);

  const auto = (lista: string[], ev: string) => lista.includes(ev);
  const situacao = (lista: string[], ev: string, manual: string) =>
    auto(lista, ev) ? <span className="text-green-700">automático ✓</span> : <span className="text-amber-700">{manual}</span>;
  const unidades = estado?.unidades;
  const tudoAtivo = !!estado && estado.eventos.includes("nfe") && estado.eventos.includes("nfe_recebida");

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Focus NFe</h2>
      <p className="mb-3 text-sm text-slate-600">
        Com a atualização automática, a Focus avisa o ERP quando uma NF-e é autorizada/rejeitada e quando um fornecedor emite nota contra o CNPJ da MF.
      </p>
      {estado && (
        <ul className="mb-3 space-y-1 text-sm">
          <li>Ambiente: <b>{estado.ambiente === "producao" ? "Produção" : "Homologação (testes)"}</b></li>
          {unidades ? unidades.map((u) => (
            <li key={u.cnpj}>
              <b>{u.nome}</b>:{" "}
              {u.erro ? <span className="text-red-600">{u.erro}</span> : (
                <>notas emitidas {situacao(u.eventos, "nfe", "manual")} · notas de fornecedores {situacao(u.eventos, "nfe_recebida", "manual (botão \"Buscar notas\")")}</>
              )}
            </li>
          )) : (
            <>
              <li>Status das notas emitidas: {situacao(estado.eventos, "nfe", "manual")}</li>
              <li>Notas de fornecedores: {situacao(estado.eventos, "nfe_recebida", "manual (botão \"Buscar notas\")")}</li>
            </>
          )}
        </ul>
      )}
      {!!falhas?.length && (
        <div className="mb-3 space-y-1 text-sm text-amber-700">
          {falhas.map((f) => <p key={f.nome}><b>{f.nome}</b> ficou de fora: {f.mensagem}</p>)}
        </div>
      )}
      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
      <Button type="button" variant="secondary" disabled={ocupado || tudoAtivo} onClick={() => chamar("registrar")}>
        {ocupado ? "Aguarde…" : "Ativar atualização automática"}
      </Button>
    </Card>
  );
}
