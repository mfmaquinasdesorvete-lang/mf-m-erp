// Configurações → Notas fiscais: tudo da NF-e num lugar só (geral, Focus NFe, notas de fornecedores e os impostos de
// cada unidade, que também ficam em Notas fiscais → Configurações) e a NFS-e de cada unidade (nota de serviço da OS).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Tabs } from "@/components/ui";
import { ConfigNfe } from "@/components/ConfigNfe";
import { ConfigNfse } from "@/components/nfse/NfsePainel";
import { callFunction } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { BotaoSalvar, Bloco, CabecalhoSecao, Opcao, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["presenca_comprador", "entrada_automatica_estoque", "entrada_so_na_entrega", "conta_pagar_automatica"];

export function ConfigNotas() {
  const s = secaoPorId("notas")!;
  const navigate = useNavigate();
  const { papel, pode } = usePerfil();
  const [aba, setAba] = useState<"geral" | "impostos" | "nfse">("geral");
  const { cfg, mudar, salvar, salvando } = useCfgPagina(CHAVES, (r) => ({ ...r, presenca_comprador: Number(r.presenca_comprador ?? 9) }));
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={s} acoes={aba === "geral" ? <BotaoSalvar form="form-notas" salvando={salvando} /> : undefined} />
      <Tabs value={aba} onChange={setAba} options={[{ value: "geral", label: "Geral e Focus NFe" }, { value: "impostos", label: "Impostos por unidade (CFOP, CST, alíquotas)" }, { value: "nfse", label: "NFS-e (serviços da OS)" }]} />
      {/* NFS-e na mesma tela das notas, como no Tiny (pedido de 22/10): com a unidade ativa, a OS concluída emite a nota de serviço */}
      {aba === "nfse" ? <ConfigNfse podeEditar={pode("configurar_nfse")} /> : aba === "impostos" ? (
        <ConfigNfe podeEditar={papel === "admin"} irParaRegras={() => navigate("/notas", { state: { aba: "regras" } })} />
      ) : (
        <form id="form-notas" onSubmit={salvar} className="space-y-5">
          <Bloco titulo="NF-e (geral)">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Presença do comprador</span>
              <select className="input" value={cfg.presenca_comprador ?? 9} onChange={(e) => mudar({ presenca_comprador: Number(e.target.value) })}>
                <option value={1}>1 - Presencial</option>
                <option value={2}>2 - Internet</option>
                <option value={3}>3 - Teleatendimento</option>
                <option value={9}>9 - Outros (não presencial)</option>
              </select>
            </label>
          </Bloco>
          <FocusNfeCard />
          <Bloco titulo="Notas de fornecedores (automático)" descricao="Quando chega uma NF-e de compra, o ERP dá ciência, lê o XML e faz o que estiver marcado. Remessas (ex.: máquina enviada para conserto) não entram: ficam em revisão para você decidir.">
            <Opcao ligado={!!cfg.entrada_automatica_estoque} onChange={(v) => mudar({ entrada_automatica_estoque: v })}>
              Dar entrada no estoque automaticamente (itens já ligados a um produto ou com o mesmo código de barras)
            </Opcao>
            <Opcao ligado={!!cfg.entrada_so_na_entrega} onChange={(v) => mudar({ entrada_so_na_entrega: v })}>
              Só dar a entrada quando a compra chegar: até a transportadora marcar entregue ou alguém apertar "Chegou" na nota, ela fica "a caminho"
            </Opcao>
            <Opcao ligado={!!cfg.conta_pagar_automatica} onChange={(v) => mudar({ conta_pagar_automatica: v })}>
              Lançar as parcelas (duplicatas) da nota em contas a pagar automaticamente
            </Opcao>
          </Bloco>
        </form>
      )}
    </div>
  );
}

type SituacaoFocus = {
  ambiente: string;
  eventos: string[];
  unidades?: { nome: string; cnpj: string; eventos: string[]; esperados?: string[]; erro?: string }[];
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
                <>notas emitidas {situacao(u.eventos, "nfe", "manual")} · notas de fornecedores {situacao(u.eventos, "nfe_recebida", "manual (botão \"Buscar notas\")")}
                  {u.esperados?.find((e) => e === "nfse" || e === "nfsen") && <> · notas de serviço {situacao(u.eventos, u.esperados.find((e) => e === "nfse" || e === "nfsen")!, "consulta a cada 5 min")}</>}</>
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
