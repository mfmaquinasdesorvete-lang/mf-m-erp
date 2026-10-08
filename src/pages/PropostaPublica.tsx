// Proposta comercial que o cliente abre pelo link (/proposta/<código>), sem login.
// Mostra a proposta com o layout da empresa e deixa aprovar (vira pedido) ou recusar (com o motivo).
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImageOff, MessageCircle, Printer, XCircle } from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { brl, dataBR, whatsappLink } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import logo from "@/assets/logo.webp";
import { MOTIVOS } from "@/lib/propostas";

type Proposta = {
  numero: number; data: string | null; validade: string | null; status: string; pedido_status: string; cliente: string; vendedor: string | null;
  itens: { descricao: string; quantidade: number; valor_unitario: number; total: number; foto: string | null; texto: string | null; garantia_meses: number | null }[];
  subtotal: number; desconto: number; frete: number; total: number; forma_pagamento: string; parcelas: number; observacoes: string | null;
  motivo_rejeicao: string | null;
  empresa: { nome: string; razao_social: string; cnpj: string | null; whatsapp: string | null; telefone: string | null; email: string | null; endereco: string | null; municipio: string | null; uf: string | null; termo_garantia: string | null };
  layout: { titulo: string; apresentacao: string | null; condicoes: string | null; rodape: string | null; cor: string };
};

const FORMAS: Record<string, string> = { boleto: "Boleto", pix: "Pix", cartao: "Cartão", transferencia: "Transferência", dinheiro: "Dinheiro" };
const cnpjFmt = (v: string | null) => (v ?? "").replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default function PropostaPublica() {
  const token = useLocation().pathname.split("/")[2] ?? "";
  const { data: p, isLoading, refetch } = useQuery({
    queryKey: ["proposta", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("proposta_publica", { p_token: token });
      if (error) throw error;
      return data as Proposta | null;
    },
    retry: false,
  });
  const [resposta, setResposta] = useState<"aprovar" | "recusar" | null>(null);

  if (isLoading) return <Tela><p className="py-24 text-center text-slate-500">Carregando a proposta…</p></Tela>;
  if (!p) return <Tela><p className="py-24 text-center text-slate-600">Proposta não encontrada. Confira o link ou fale com o vendedor.</p></Tela>;
  const cor = p.layout.cor || "#0EA5E9";
  const aberta = (p.status === "enviada" || p.status === "visualizada") && p.pedido_status === "orcamento";
  const zap = p.empresa.whatsapp;

  return (
    <Tela>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex flex-wrap items-center gap-4 px-6 py-5 text-white" style={{ background: cor }}>
          <img src={logo} alt="" className="h-14 w-14 rounded-xl bg-white/10" />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-extrabold">{p.empresa.nome}</div>
            <div className="text-xs opacity-90">{[p.empresa.razao_social, p.empresa.cnpj && `CNPJ ${cnpjFmt(p.empresa.cnpj)}`].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold uppercase tracking-wide opacity-90">{p.layout.titulo}</div>
            <div className="text-2xl font-extrabold">nº {p.numero}</div>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6 text-[15px] text-slate-800">
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <div><div className="text-xs font-semibold uppercase text-slate-500">Para</div><div className="text-lg font-bold text-slate-900">{p.cliente}</div></div>
            <div className="text-right">
              {p.data && <div>Emitida em <b>{dataBR(p.data)}</b></div>}
              {p.validade && <div>Válida até <b>{dataBR(p.validade)}</b></div>}
              {p.vendedor && <div>Atendimento: <b>{p.vendedor}</b></div>}
            </div>
          </div>

          <Situacao status={p.status} cor={cor} motivo={p.motivo_rejeicao} />

          {p.layout.apresentacao && <p className="whitespace-pre-line text-slate-700">{p.layout.apresentacao}</p>}

          <div className="space-y-3">
            {p.itens.map((i, n) => (
              <div key={n} className="flex gap-3 rounded-xl border border-slate-200 p-3 print:break-inside-avoid">
                {p.itens.some((x) => x.foto) && (
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">
                    {i.foto ? <img src={urlFotoProduto(i.foto)} alt="" className="h-full w-full object-contain" /> : <ImageOff size={22} className="text-slate-300" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{i.descricao}</div>
                  {i.texto && <p className="mt-0.5 line-clamp-3 text-sm text-slate-600 print:line-clamp-none">{i.texto}</p>}
                  {i.garantia_meses ? <p className="mt-0.5 text-xs font-semibold text-emerald-700">Garantia de {i.garantia_meses} meses</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm text-slate-500">{Number(i.quantidade).toLocaleString("pt-BR")} × {brl(i.valor_unitario)}</div>
                  <div className="text-lg font-bold text-slate-900">{brl(i.total)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <Linha r="Produtos" v={brl(p.subtotal)} />
            {Number(p.desconto) > 0 && <Linha r="Desconto" v={`- ${brl(p.desconto)}`} />}
            {Number(p.frete) > 0 && <Linha r="Frete" v={brl(p.frete)} />}
            <div className="flex justify-between border-t-2 pt-2 text-xl font-extrabold text-slate-900" style={{ borderColor: cor }}><span>Total</span><span>{brl(p.total)}</span></div>
            <div className="text-right text-slate-600">{FORMAS[p.forma_pagamento] ?? p.forma_pagamento}{p.parcelas > 1 ? ` em ${p.parcelas}x de ${brl(p.total / p.parcelas)}` : " à vista"}</div>
          </div>

          {p.observacoes && <Bloco titulo="Observações">{p.observacoes}</Bloco>}
          {p.layout.condicoes && <Bloco titulo="Condições">{p.layout.condicoes}</Bloco>}
          {p.itens.some((i) => i.garantia_meses) && p.empresa.termo_garantia && <Bloco titulo="Garantia">{p.empresa.termo_garantia}</Bloco>}

          {aberta && (
            <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row print:hidden">
              <button type="button" onClick={() => setResposta("aprovar")} className="inline-flex min-h-[54px] flex-1 items-center justify-center gap-2 rounded-xl px-5 text-lg font-bold text-white" style={{ background: cor }}>
                <CheckCircle2 size={22} /> Aprovar proposta
              </button>
              <button type="button" onClick={() => setResposta("recusar")} className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700">
                <XCircle size={20} /> Não vou fechar
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-sm print:hidden">
            {zap && <a href={whatsappLink(zap, `Olá! Sobre a proposta nº ${p.numero}.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><MessageCircle size={16} /> Tirar dúvidas no WhatsApp</a>}
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 font-semibold text-slate-600"><Printer size={16} /> Imprimir / salvar PDF</button>
          </div>
        </div>
        <footer className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
          {p.layout.rodape && <p className="mb-1 whitespace-pre-line">{p.layout.rodape}</p>}
          {[p.empresa.endereco, p.empresa.municipio && `${p.empresa.municipio}/${p.empresa.uf ?? ""}`, p.empresa.telefone, p.empresa.email].filter(Boolean).join(" · ")}
        </footer>
      </div>
      {resposta && <Responder token={token} aprovar={resposta === "aprovar"} cor={cor} total={p.total} onClose={() => setResposta(null)} onFeito={() => { setResposta(null); refetch(); }} />}
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  // documento do cliente: sempre claro, independente do tema escolhido no ERP
  useEffect(() => {
    const antes = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    return () => { if (antes) document.documentElement.dataset.theme = antes; };
  }, []);
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0" style={{ colorScheme: "light" }}>
      {DEMO && <button type="button" onClick={() => navigate("/pedidos")} className="mx-auto mb-3 block rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white print:hidden">← Prévia: voltar ao ERP</button>}
      {children}
    </div>
  );
}
const Linha = ({ r, v }: { r: string; v: string }) => <div className="flex justify-between text-slate-600"><span>{r}</span><span>{v}</span></div>;
const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div><h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h3><p className="whitespace-pre-line text-sm text-slate-700">{children}</p></div>
);

function Situacao({ status, cor, motivo }: { status: string; cor: string; motivo: string | null }) {
  if (status === "aprovada") return <div className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800"><CheckCircle2 size={18} className="mr-1.5 inline" />Proposta aprovada. Obrigado! Nossa equipe já recebeu o pedido e vai entrar em contato.</div>;
  if (status === "rejeitada") return <div className="rounded-xl bg-slate-100 p-4 text-slate-700">Proposta recusada{motivo ? ` (${MOTIVOS[motivo] ?? motivo})` : ""}. Se mudar de ideia, é só chamar a gente.</div>;
  if (status === "expirada") return <div className="rounded-xl bg-amber-50 p-4 text-amber-900">Esta proposta venceu. Fale com o vendedor para receber uma atualizada.</div>;
  return <div className="h-1 rounded-full" style={{ background: cor, opacity: 0.25 }} />;
}

function Responder({ token, aprovar, cor, total, onClose, onFeito }: { token: string; aprovar: boolean; cor: string; total: number; onClose: () => void; onFeito: () => void }) {
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("preco");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { error } = await supabase.rpc("proposta_responder", { p_token: token, p_aprovar: aprovar, p_nome: nome, p_motivo: aprovar ? null : motivo, p_texto: aprovar ? null : texto || null });
    setOcupado(false);
    if (error) return notifyError(error);
    onFeito();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-3 print:hidden" onClick={onClose}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 text-slate-800 shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900">{aprovar ? "Aprovar a proposta" : "Que pena! Pode contar o motivo?"}</h2>
        {aprovar && <p className="text-sm text-slate-600">Ao aprovar, o pedido de {brl(total)} é confirmado com as condições acima. A equipe entra em contato para combinar a entrega.</p>}
        {!aprovar && (
          <>
            <label className="block text-sm font-semibold">Motivo
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px]" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {Object.entries(MOTIVOS).filter(([k]) => k !== "sem_resposta").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Comentário (opcional)
              <textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px]" rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: o frete ficou alto para a minha cidade" />
            </label>
          </>
        )}
        <label className="block text-sm font-semibold">Seu nome
          <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px]" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} autoFocus />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 font-semibold text-slate-600">Voltar</button>
          <button disabled={ocupado} className="rounded-lg px-5 py-2.5 font-bold text-white disabled:opacity-60" style={{ background: aprovar ? cor : "#475569" }}>
            {ocupado ? "Enviando…" : aprovar ? "Confirmar aprovação" : "Enviar resposta"}
          </button>
        </div>
      </form>
    </div>
  );
}
