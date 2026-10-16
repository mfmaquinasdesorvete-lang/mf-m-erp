// Envio de estoque e preço para os anúncios do Mercado Livre: o que o ERP manda, de onde vem o preço, estoque de
// segurança, limite e a trava de preço. Cada ajuste com uma explicação curta e um exemplo com os números escolhidos.
import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Lock, Package, Tag } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { ajusteTexto, arredondar, type TabelaPreco } from "@/lib/tabelasPreco";
import { estoqueDisponivel, precoAEnviar, reais, type ContaML } from "@/lib/mlAnuncios";
import { configurarEnvio } from "@/lib/useMercadoLivre";

type Form = {
  enviar_estoque: boolean; enviar_preco: boolean; preco_tabela_id: string; preco_ajuste: string;
  estoque_seguranca: string; estoque_maximo: string; trava_preco: string;
};

const texto = (v: number | null | undefined, padrao = "") => (v === null || v === undefined ? padrao : String(v).replace(".", ","));
const numero = (s: string) => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  return t === "" ? null : Number(t);
};

const formDe = (c: ContaML): Form => ({
  enviar_estoque: !!c.enviar_estoque, enviar_preco: !!c.enviar_preco, preco_tabela_id: c.preco_tabela_id ?? "",
  preco_ajuste: texto(c.preco_ajuste, "0"), estoque_seguranca: texto(c.estoque_seguranca, "0"),
  estoque_maximo: texto(c.estoque_maximo), trava_preco: texto(c.trava_preco, "20"),
});

function Ajuda({ children }: { children: ReactNode }) {
  return <span className="mt-1 block text-xs text-slate-500">{children}</span>;
}

function Interruptor({ ligado, onChange, disabled, titulo, children }: { ligado: boolean; onChange: (v: boolean) => void; disabled?: boolean; titulo: string; children: ReactNode }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-3 ${ligado ? "border-emerald-200 bg-emerald-50" : "border-slate-200"} ${disabled ? "" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ligado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 text-sm">
        <b className="block text-fg">{titulo}</b>
        <span className="text-slate-600">{children}</span>
      </span>
    </label>
  );
}

export function EnvioEstoquePreco({ conta, podeMudar, irConta }: { conta: ContaML | null; podeMudar: boolean; irConta: () => void }) {
  if (!conta) {
    return (
      <Card className="p-6 text-center">
        <p className="mb-3 text-sm text-slate-600">Conecte antes a conta do Mercado Livre. Depois é só escolher aqui o que o ERP manda para os anúncios.</p>
        <Button variant="secondary" onClick={irConta}>Ir para Conta</Button>
      </Card>
    );
  }
  return <FormEnvio key={conta.id} conta={conta} podeMudar={podeMudar} />;
}

function FormEnvio({ conta, podeMudar }: { conta: ContaML; podeMudar: boolean }) {
  const [f, setF] = useState<Form>(() => formDe(conta));
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const { unidades } = useUnidade();
  const { data: tabelas = [] } = useRows<TabelaPreco>("tabelas_preco", { order: "nome", ascending: true });
  const ativas = tabelas.filter((t) => t.ativo || t.id === f.preco_tabela_id);
  const unidade = unidades.find((u) => u.id === conta.unidade_id)?.codigo ?? "SP";
  const mudar = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const travado = !podeMudar;

  // exemplo com os números escolhidos (produto de 10 unidades e R$ 100,00)
  const exEstoque = estoqueDisponivel({ saldo: 10, seguranca: numero(f.estoque_seguranca), maximo: numero(f.estoque_maximo) });
  const tabela = tabelas.find((t) => t.id === f.preco_tabela_id);
  const exBase = tabela?.ativo ? arredondar(100 * (1 + Number(tabela.ajuste_percentual) / 100), tabela.arredondamento) : 100;
  const exPreco = precoAEnviar({ base: exBase, ajuste: numero(f.preco_ajuste) });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const ajuste = numero(f.preco_ajuste) ?? 0, seguranca = numero(f.estoque_seguranca) ?? 0, maximo = numero(f.estoque_maximo), trava = numero(f.trava_preco) ?? 0;
    if (![ajuste, seguranca, trava].every(Number.isFinite) || (maximo !== null && !Number.isFinite(maximo))) return notify("Confira os números (use só algarismos e vírgula).", "erro");
    if (ajuste < -50 || ajuste > 300) return notify("O ajuste do preço vai de −50% a +300%.", "erro");
    if (seguranca < 0 || (maximo !== null && maximo < 0)) return notify("Estoque de segurança e limite não podem ser negativos.", "erro");
    if (trava < 0 || trava > 100) return notify("A trava de preço vai de 0% (sem trava) a 100%.", "erro");
    if (f.enviar_preco && !conta.enviar_preco && !(await confirmar(
      `O ERP vai mudar o preço dos anúncios no Mercado Livre. ${trava > 0 ? `Mudança maior que ${texto(trava)}% espera aprovação na lista de anúncios.` : "Sem trava: toda mudança vai direto."} Preço zerado ou abaixo do custo nunca vai. Ligar?`,
      { titulo: "Mandar o preço para o Mercado Livre", ok: "Ligar o envio do preço" },
    ))) return;
    setSalvando(true);
    try {
      await configurarEnvio(conta.id, {
        enviar_estoque: f.enviar_estoque, enviar_preco: f.enviar_preco, preco_tabela_id: f.preco_tabela_id || null,
        preco_ajuste: ajuste, estoque_seguranca: Math.round(seguranca), estoque_maximo: maximo ? Math.round(maximo) : null, trava_preco: trava,
      });
      notify(f.enviar_estoque || f.enviar_preco ? "Ajustes salvos. Os anúncios entram na fila e são atualizados em até 5 minutos." : "Ajustes salvos. O envio está desligado.");
    } catch (err) { notifyError(err); } finally {
      setSalvando(false);
      invalidar("ml_contas", "ml_anuncios");
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      {travado && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Só o administrador, o financeiro ou marketplaces mudam estes ajustes. Você pode consultar.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <Interruptor ligado={f.enviar_estoque} disabled={travado} onChange={(v) => mudar({ enviar_estoque: v })} titulo="Mandar o estoque">
          O anúncio mostra o estoque da unidade <b>{unidade}</b>. Mudou no ERP (venda, compra, contagem), o anúncio muda em até 5 minutos. Kit: o que dá para montar com as peças.
        </Interruptor>
        <Interruptor ligado={f.enviar_preco} disabled={travado} onChange={(v) => mudar({ enviar_preco: v })} titulo="Mandar o preço">
          O preço do anúncio segue o ERP. Nunca vai preço zerado ou abaixo do custo: o anúncio fica com erro para você conferir.
        </Interruptor>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-fg"><Tag size={15} /> Preço</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Qual preço usar">
            <select className="input" value={f.preco_tabela_id} disabled={travado} onChange={(e) => mudar({ preco_tabela_id: e.target.value })}>
              <option value="">Preço de venda do produto</option>
              {ativas.map((t) => <option key={t.id} value={t.id}>Tabela {t.nome} ({ajusteTexto(t.ajuste_percentual)}){t.ativo ? "" : " — desativada"}</option>)}
            </select>
            <Ajuda>Uma tabela de preço (ex.: Marketplace) serve para cobrir as tarifas do Mercado Livre. Preço fixo na tabela também vale.</Ajuda>
          </Field>
          <Field label="Ajuste no preço (%)">
            <input className="input" inputMode="decimal" value={f.preco_ajuste} disabled={travado} onChange={(e) => mudar({ preco_ajuste: e.target.value })} />
            <Ajuda>Soma ao preço escolhido. Ex.: 10 = 10% a mais; −5 = 5% a menos; 0 = igual.</Ajuda>
          </Field>
          <Field label="Trava de preço (%)">
            <input className="input" inputMode="decimal" value={f.trava_preco} disabled={travado} onChange={(e) => mudar({ trava_preco: e.target.value })} />
            <Ajuda>Mudança maior que isso não vai sozinha: espera alguém aprovar na lista de anúncios. 0 = sem trava.</Ajuda>
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <b className="text-fg">Exemplo:</b> produto de {reais(100)}{tabela ? ` (na tabela ${tabela.nome}: ${reais(exBase)})` : ""} →{" "}
            {exPreco.erro !== null ? <span className="text-red-700">{exPreco.erro}</span> : <>vai <b className="num text-fg">{reais(exPreco.preco)}</b> para o anúncio</>}.
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-fg"><Package size={15} /> Estoque</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Estoque de segurança (unidades)">
            <input className="input" inputMode="numeric" value={f.estoque_seguranca} disabled={travado} onChange={(e) => mudar({ estoque_seguranca: e.target.value })} />
            <Ajuda>Unidades que ficam guardadas (balcão, assistência). Não aparecem no anúncio.</Ajuda>
          </Field>
          <Field label="Limite de estoque no anúncio">
            <input className="input" inputMode="numeric" placeholder="sem limite" value={f.estoque_maximo} disabled={travado} onChange={(e) => mudar({ estoque_maximo: e.target.value })} />
            <Ajuda>O anúncio mostra no máximo isso, mesmo com mais no estoque. Vazio = sem limite.</Ajuda>
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 md:col-span-2">
            <b className="text-fg">Exemplo:</b> com 10 no estoque de {unidade}, o anúncio mostra <b className="num text-fg">{exEstoque}</b>. Sem estoque, o anúncio mostra 0 e o Mercado Livre pausa sozinho.
          </div>
        </div>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <Lock size={13} className="mt-0.5 shrink-0" /> Cada anúncio pode ter exceção (não mandar estoque ou não mandar preço) na lista de anúncios.
        Uma vez por dia o ERP confere todos os anúncios ligados e manda só o que estiver diferente.
      </p>
      {podeMudar && (
        <div className="flex justify-end">
          <Button type="submit" disabled={salvando}>{salvando ? <Loader2 size={15} className="animate-spin" /> : null} Salvar ajustes</Button>
        </div>
      )}
    </form>
  );
}
