// Página da máquina do cliente (sem login): o link que a equipe manda pelo WhatsApp. Mostra o modelo, o número de
// série, a garantia e a próxima preventiva, os manuais (máquina e elétrico), as dicas de manutenção, as
// especificações e as fotos e vídeos; o botão chama a assistência já dizendo qual máquina é.
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileText, Loader2, MessageCircle, ShieldCheck, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dataBR, hoje, whatsappLink } from "@/lib/format";
import { NOME_MIDIA, urlMidia, type TipoMidia } from "@/lib/midia";
import { urlFotoProduto } from "@/lib/catalogo";
import logo from "@/assets/logo.webp";

type Publica = {
  maquina: { descricao: string; modelo?: string; numero_serie?: string; data_venda?: string; garantia_ate?: string; proxima_preventiva?: string; usada?: boolean; outra_empresa?: string; foto?: string };
  cliente: string | null; especificacoes: { nome: string; valor: string }[]; dicas: string | null;
  midia: { tipo: TipoMidia; titulo: string | null; caminho: string; mime: string | null }[];
  empresa: { nome: string; whatsapp: string | null; telefone: string | null; email: string | null };
};

export default function MaquinaPublica() {
  const token = useLocation().pathname.split("/")[2] ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["maquina_publica", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("maquina_publica", { p_token: token });
      if (error) throw error;
      return data as Publica | null;
    },
  });
  if (isLoading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500"><Loader2 className="animate-spin" /></div>;
  if (error || !data) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center text-slate-600">Link não encontrado. Peça um novo para a equipe da MF Máquinas.</div>;
  }
  const m = data.maquina;
  const dia = hoje();
  const garantiaOk = !!m.garantia_ate && m.garantia_ate >= dia;
  const docs = data.midia.filter((x) => !["foto", "video"].includes(x.tipo));
  const galeria = data.midia.filter((x) => x.tipo === "foto" || x.tipo === "video");
  const msg = `Olá! Sou ${data.cliente || "cliente"} e preciso de ajuda com a minha ${m.descricao}${m.numero_serie ? ` (série ${m.numero_serie})` : ""}.`;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ colorScheme: "light" }}>
      <header className="bg-[#0b2a4a] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <img src={logo} alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-200">{data.empresa.nome}</div>
            <h1 className="truncate text-lg font-extrabold">{data.cliente ? `Olá, ${data.cliente}! Esta é a sua máquina` : "Sua máquina"}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:flex-row">
          {m.foto && <img src={urlFotoProduto(m.foto)} alt="" className="h-40 w-full rounded-xl object-contain sm:w-40" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-slate-900">{m.descricao}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {m.numero_serie && <><dt className="text-slate-500">Nº de série</dt><dd className="font-semibold">{m.numero_serie}</dd></>}
              {m.data_venda && <><dt className="text-slate-500">Comprada em</dt><dd className="font-semibold">{dataBR(m.data_venda)}</dd></>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {m.garantia_ate && (
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${garantiaOk ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  <ShieldCheck size={15} /> Garantia {garantiaOk ? `até ${dataBR(m.garantia_ate)}` : `terminou em ${dataBR(m.garantia_ate)}`}
                </span>
              )}
              {m.proxima_preventiva && (
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${m.proxima_preventiva < dia ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                  <CalendarClock size={15} /> Preventiva {m.proxima_preventiva < dia ? "atrasada desde" : "em"} {dataBR(m.proxima_preventiva)}
                </span>
              )}
            </div>
          </div>
        </section>

        {(data.empresa.whatsapp || data.empresa.telefone) && (
          <a href={whatsappLink(data.empresa.whatsapp || data.empresa.telefone || "", msg)} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-bold text-white shadow-sm hover:bg-emerald-700">
            <MessageCircle size={22} /> Chamar a assistência no WhatsApp
          </a>
        )}

        {docs.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-bold text-slate-900">Manuais e documentos</h3>
            <ul className="divide-y divide-slate-100">
              {docs.map((d, i) => (
                <li key={i}>
                  <a href={urlMidia(d.caminho)} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 hover:text-sky-700">
                    <FileText size={20} className="shrink-0 text-sky-600" />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{d.titulo || NOME_MIDIA[d.tipo]}</span><span className="text-xs text-slate-500">{NOME_MIDIA[d.tipo]} · abrir</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.dicas && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><Wrench size={18} className="text-sky-600" /> Dicas de manutenção</h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{data.dicas}</p>
          </section>
        )}

        {data.especificacoes.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-bold text-slate-900">Especificações</h3>
            <dl className="divide-y divide-slate-100 text-sm">
              {data.especificacoes.map((e) => (
                <div key={e.nome} className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">{e.nome}</dt><dd className="text-right font-semibold">{e.valor}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {galeria.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-bold text-slate-900">Fotos e vídeos</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {galeria.map((g, i) => g.tipo === "video"
                ? <video key={i} src={urlMidia(g.caminho)} controls playsInline preload="metadata" className="aspect-square w-full rounded-lg bg-black object-cover" />
                : <img key={i} src={urlMidia(g.caminho)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />)}
            </div>
          </section>
        )}
        <p className="pb-6 text-center text-xs text-slate-400">{data.empresa.nome}{data.empresa.email ? ` · ${data.empresa.email}` : ""}</p>
      </main>
    </div>
  );
}
