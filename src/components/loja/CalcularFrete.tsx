// "Calcule o frete" da loja: o cliente digita o CEP e vê as opções com preço e prazo (função frete-cotar, com as
// regras de frete). Na página do produto só mostra; no carrinho o cliente escolhe e a escolha vai junto com o pedido
// (o valor é o gravado na consulta, no servidor). Aparece só com o cálculo ligado em Fretes → Regras de frete.
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Truck } from "lucide-react";
import { brl, whatsappLink } from "@/lib/format";
import { callFunction, supabase } from "@/lib/supabase";
import type { OpcaoFrete } from "../../../supabase/functions/_shared/frete-cotar";

export type EscolhaFrete = { consulta_id: string; opcao: Omit<OpcaoFrete, "valor"> };
type Resposta = { consulta_id: string; cidade: string | null; uf: string | null; sob_consulta: boolean; opcoes: Omit<OpcaoFrete, "valor">[] };

export function useFreteLigado() {
  return useQuery({
    queryKey: ["loja", "frete-ligado"], staleTime: 5 * 60_000,
    queryFn: async () => { const { data } = await supabase.rpc("loja_frete_ligado"); return data === true; },
  });
}

export function CalcularFrete({ itens, cepInicial, whatsapp, onEscolha, escolhida }: {
  itens: { produto_id: string; quantidade: number }[];
  cepInicial?: string | null;
  whatsapp?: string | null;
  /** no carrinho: o cliente escolhe a opção */
  onEscolha?: (e: EscolhaFrete | null) => void;
  escolhida?: string | null;
}) {
  const ligado = useFreteLigado();
  const [cep, setCep] = useState(cepInicial ?? "");
  const [r, setR] = useState<(Resposta & { cep: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const chave = JSON.stringify(itens);

  useEffect(() => { if (cepInicial && !cep) setCep(cepInicial); }, [cepInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  // mudou o carrinho: o frete calculado não vale mais
  useEffect(() => { setR(null); onEscolha?.(null); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function calcular(ev?: FormEvent) {
    ev?.preventDefault();
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return setErro("Digite o CEP com 8 números");
    if (!itens.length) return;
    setCalculando(true); setErro(null); onEscolha?.(null);
    try {
      const res = await callFunction<Resposta>("frete-cotar", { cep: d, itens });
      setR({ ...res, cep: d });
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setR(null); } finally { setCalculando(false); }
  }

  if (!ligado.data) return null;
  return (
    <div className="cartao mt-4 p-4">
      <form onSubmit={calcular} className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Truck size={16} aria-hidden /> Calcule o frete</span>
          <input className="input" inputMode="numeric" autoComplete="postal-code" value={cep} onChange={(e) => { setCep(e.target.value); setR(null); onEscolha?.(null); }} placeholder="Seu CEP" maxLength={9} aria-label="CEP para calcular o frete" />
        </label>
        <button type="submit" disabled={calculando} className="linha-clicavel !w-auto min-h-[46px] rounded-xl border border-slate-300 px-4 font-semibold disabled:opacity-60">{calculando ? "Calculando…" : "Calcular"}</button>
      </form>
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
      {r && (
        <div className="mt-3">
          {r.cidade && <p className="mb-2 text-sm text-slate-500">Para {r.cidade}/{r.uf}</p>}
          <ul className="space-y-1.5" role={onEscolha ? "radiogroup" : undefined} aria-label={onEscolha ? "Escolha o frete" : undefined}>
            {r.opcoes.map((o) => {
              const conteudo = (
                <>
                  <span className="min-w-0 flex-1"><b className="text-fg">{o.transportadora}</b>{o.servico ? <span className="text-slate-500"> · {o.servico}</span> : null}
                    {o.prazo != null && <span className="block text-xs text-slate-500">até {o.prazo} {o.prazo === 1 ? "dia útil" : "dias úteis"} após o envio</span>}</span>
                  <span className="num shrink-0 font-bold">{o.valor_cliente === 0 ? (o.id === "retirada" ? "grátis" : "Frete grátis") : brl(o.valor_cliente)}</span>
                </>
              );
              return (
                <li key={o.id}>
                  {onEscolha ? (
                    <button type="button" role="radio" aria-checked={escolhida === o.id} onClick={() => onEscolha({ consulta_id: r.consulta_id, opcao: o })}
                      className={`linha-clicavel flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm ${escolhida === o.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                      <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${escolhida === o.id ? "border-brand bg-brand" : "border-slate-300"}`} aria-hidden />{conteudo}
                    </button>
                  ) : <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">{conteudo}</div>}
                </li>
              );
            })}
          </ul>
          {r.sob_consulta && (
            <p className="mt-2 text-sm text-slate-600">Para este produto o frete é calculado pela nossa equipe.
              {whatsapp && <a href={whatsappLink(whatsapp, `Olá! Quanto fica o frete para o CEP ${r.cep}?`)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 font-semibold text-brand"><MessageCircle size={14} aria-hidden /> Pedir no WhatsApp</a>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
