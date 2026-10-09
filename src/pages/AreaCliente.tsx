// Página do cliente (/cliente/<código>), sem login: as contas em aberto com o Pix copia e cola e o QR Code de
// cada uma (com o valor certo), a segunda via para imprimir/salvar em PDF e os últimos pagamentos.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import qrcode from "qrcode-generator";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, whatsappLink } from "@/lib/format";
import { pixCopiaECola } from "@/lib/cobranca";
import logo from "@/assets/logo.webp";

type Aberta = { id: string; descricao: string; valor: number; vencimento: string; forma: string | null; pagamento: string | null; pix_chave: string | null; pix_nome: string | null; pix_cidade: string | null };
type Area = {
  cliente: string; empresa: { nome: string; whatsapp: string | null; telefone: string | null; email: string | null };
  abertas: Aberta[]; pagas: { descricao: string; valor: number; data_pagamento: string | null }[];
};

export default function AreaCliente() {
  const token = useLocation().pathname.split("/")[2] ?? "";
  const { data: a, isLoading } = useQuery({
    queryKey: ["area_cliente", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("area_cliente", { p_token: token });
      if (error) throw error;
      return data as Area | null;
    },
    retry: false,
  });
  if (isLoading) return <Tela><p className="py-24 text-center text-slate-500">Carregando…</p></Tela>;
  if (!a) return <Tela><p className="py-24 text-center text-slate-600">Link não encontrado. Peça um link novo para a MF Máquinas.</p></Tela>;
  const dia = hoje();
  const total = a.abertas.reduce((s, c) => s + Number(c.valor), 0);
  const zap = a.empresa.whatsapp || a.empresa.telefone;

  return (
    <Tela>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex items-center gap-4 bg-[#0B1F3A] px-6 py-5 text-white">
          <img src={logo} alt="" className="h-12 w-12 rounded-xl bg-white/10" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-extrabold">{a.empresa.nome}</div>
            <div className="text-sm opacity-90">Contas de {a.cliente}</div>
          </div>
        </header>
        <div className="space-y-5 px-5 py-6 text-[15px] text-slate-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Em aberto</div>
              <div className="text-3xl font-extrabold text-slate-900">{brl(total)}</div>
              <div className="text-sm text-slate-500">{a.abertas.length ? `${a.abertas.length} conta(s)` : "Nada em aberto. Obrigado!"}</div>
            </div>
            <div className="flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Printer size={16} /> Segunda via (PDF)</button>
              {zap && <a href={whatsappLink(zap, `Olá! Sou ${a.cliente} e quero falar sobre as minhas contas.`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle size={16} /> Falar</a>}
            </div>
          </div>

          {a.abertas.map((c) => <Conta key={c.id} c={c} dia={dia} />)}

          {a.pagas.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Últimos pagamentos</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {a.pagas.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2"><span>{p.descricao}<span className="block text-xs text-slate-500">pago em {dataBR(p.data_pagamento)}</span></span><b className="whitespace-nowrap">{brl(p.valor)}</b></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-500">Pagou e ainda aparece aqui? O pagamento pode levar até 2 dias úteis para ser identificado. {a.empresa.email && `Dúvidas: ${a.empresa.email}.`}</p>
        </div>
      </div>
    </Tela>
  );
}

function Conta({ c, dia }: { c: Aberta; dia: string }) {
  const [copiado, setCopiado] = useState(false);
  const pix = useMemo(() => (c.pix_chave ? pixCopiaECola({ chave: c.pix_chave, nome: c.pix_nome ?? "", cidade: c.pix_cidade ?? "", valor: Number(c.valor), txid: `MF${c.id.replace(/-/g, "").slice(0, 20)}` }) : null), [c]);
  const qr = useMemo(() => {
    if (!pix) return null;
    const q = qrcode(0, "M");
    q.addData(pix);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [pix]);
  const vencida = c.vencimento < dia;
  return (
    <div className="break-inside-avoid rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">{c.descricao}</div>
          <div className={`text-sm ${vencida ? "font-semibold text-red-700" : "text-slate-600"}`}>{vencida ? `Venceu em ${dataBR(c.vencimento)}` : c.vencimento === dia ? "Vence hoje" : `Vence em ${dataBR(c.vencimento)}`}</div>
        </div>
        <div className="text-xl font-extrabold text-slate-900">{brl(c.valor)}</div>
      </div>
      {pix ? (
        <div className="mt-3 grid items-center gap-4 sm:grid-cols-[150px_1fr]">
          <div className="mx-auto w-[150px]" aria-label="QR Code do Pix" dangerouslySetInnerHTML={{ __html: qr ?? "" }} />
          <div className="min-w-0">
            <div className="mb-1 text-xs font-semibold text-slate-500">Pix copia e cola (o valor já vem preenchido)</div>
            <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-800">{pix}</div>
            <button type="button" onClick={() => navigator.clipboard.writeText(pix).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#066d8c] px-3 py-2 text-sm font-semibold text-white print:hidden">
              {copiado ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar código Pix</>}
            </button>
          </div>
        </div>
      ) : null}
      {c.pagamento && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700"><b>Como pagar:</b> {c.pagamento}</p>}
    </div>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  // página do cliente: sempre clara, independente do tema escolhido no ERP
  useEffect(() => {
    const antes = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    return () => { if (antes) document.documentElement.dataset.theme = antes; };
  }, []);
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0" style={{ colorScheme: "light" }}>
      {DEMO && <button type="button" onClick={() => navigate("/financeiro")} className="mx-auto mb-3 block rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white print:hidden">← Prévia: voltar ao ERP</button>}
      {children}
    </div>
  );
}
