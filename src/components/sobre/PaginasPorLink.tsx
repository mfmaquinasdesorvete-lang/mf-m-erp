// Sobre → Módulos → Páginas por link: as páginas que o cliente, o fornecedor e o representante abrem sem entrar no
// ERP. Cada uma diz quem recebe, onde a equipe gera o link e abre um exemplo real. As páginas com código (/proposta/…,
// /cliente/…) só abrem com o código de um link de verdade: o "Abrir um exemplo" pega o mais recente no banco. Aberta por
// alguém da equipe logado, a página não conta como "o cliente viu" (o banco confere quem abriu).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, ExternalLink, FileSignature, FileText, IceCreamCone, Loader2, MapPin, Store, Users, Wallet } from "lucide-react";
import { Card } from "@/components/ui";
import { DEMO, supabase } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { PAGINAS_POR_LINK, type ExemploLink } from "@/lib/modulos";

const ICONE: Record<string, typeof FileText> = {
  "/proposta/…": FileText, "/cliente/…": Wallet, "/ficha/…": FileSignature, "/maquina/…": IceCreamCone,
  "/cotacao/…": ClipboardList, "/loja": Store, "/portal": Users,
};

/** Código (token) do link mais recente de cada tipo, para abrir um exemplo de verdade. */
async function tokenDoExemplo(tipo: ExemploLink): Promise<string | null> {
  const um = async (tabela: string, coluna: string, ajustar: (q: any) => any, ordem?: string) => {
    let q = ajustar(supabase.from(tabela).select(coluna).not(coluna, "is", null));
    if (ordem) q = q.order(ordem, { ascending: false });
    const { data } = await q.limit(20);
    return (data ?? []) as Record<string, any>[];
  };
  if (tipo === "proposta") return (await um("pedidos", "proposta_token", (q) => q.not("proposta_status", "is", null), "proposta_enviada_em"))[0]?.proposta_token ?? null;
  if (tipo === "cliente") return (await um("clientes", "portal_token", (q) => q))[0]?.portal_token ?? null;
  if (tipo === "ficha") return (await um("clientes_assinaturas", "token", (q) => q.eq("canal", "link"), "created_at"))[0]?.token ?? null;
  if (tipo === "maquina") return (await um("equipamentos", "token", (q) => q, "data_venda"))[0]?.token ?? null;
  // cotação: só as que já foram enviadas (rascunho não abre para o fornecedor)
  const convites = await um("cotacao_fornecedores", "token, cotacao_id", (q) => q, "created_at");
  if (!convites.length) return null;
  const { data: cot } = await supabase.from("cotacoes").select("id, status").neq("status", "rascunho");
  const enviadas = new Set(((cot ?? []) as { id: string }[]).map((c) => c.id));
  return convites.find((c) => enviadas.has(c.cotacao_id))?.token ?? null;
}

export function PaginasPorLink({ filtro }: { filtro: (p: (typeof PAGINAS_POR_LINK)[number]) => boolean }) {
  const navigate = useNavigate();
  const [abrindo, setAbrindo] = useState("");
  const lista = PAGINAS_POR_LINK.filter(filtro);
  if (!lista.length) return null;

  async function abrir(p: (typeof PAGINAS_POR_LINK)[number]) {
    let caminho = p.abre ?? null;
    if (!caminho && p.exemplo) {
      setAbrindo(p.caminho);
      const token = await tokenDoExemplo(p.exemplo).catch(() => null);
      setAbrindo("");
      if (!token) return notify(`Ainda não há nenhum link de "${p.nome}" para abrir. Gere um em: ${p.onde}.`);
      caminho = p.caminho.replace("…", token);
    }
    if (!caminho) return;
    // na prévia o ERP roda numa aba só; no ERP de verdade a página abre numa aba nova, como o cliente vê
    if (DEMO) navigate(caminho);
    else window.open(caminho, "_blank", "noopener");
  }

  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0e7490] text-white shadow-sm" aria-hidden><ExternalLink size={19} /></span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-fg">Páginas por link</h2>
          <p className="text-sm text-slate-600">
            Abertas sem entrar no ERP, pelo link que a equipe manda a clientes, fornecedores e representantes. Cada link tem um código só daquele
            cliente ou fornecedor (por isso <code className="text-xs">/proposta/</code> sozinho não abre): use "Abrir um exemplo" para ver um de verdade.
            Aberto por você, logado no ERP, o link não conta como "o cliente viu".
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {lista.map((p) => {
          const Icone = ICONE[p.caminho] ?? ExternalLink;
          const podeAbrir = !!(p.abre || p.exemplo);
          return (
            <li key={p.caminho} className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 p-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800" aria-hidden><Icone size={17} /></span>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-fg">{p.nome}</span> <code className="break-all text-xs text-slate-500">{p.caminho}</code>
                  <p className="text-xs leading-snug text-slate-600">{p.texto}</p>
                </div>
              </div>
              <dl className="grid gap-1 text-xs leading-snug">
                <div className="flex gap-1.5"><dt className="shrink-0 font-semibold text-slate-700">Quem recebe:</dt><dd className="min-w-0 text-slate-600">{p.quem}</dd></div>
                <div className="flex gap-1.5"><dt className="shrink-0 font-semibold text-slate-700"><MapPin size={12} className="mr-0.5 inline" aria-hidden />Onde se gera:</dt><dd className="min-w-0 text-slate-600">{p.onde}</dd></div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {podeAbrir && (
                  <button type="button" onClick={() => abrir(p)} disabled={abrindo === p.caminho}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                    {abrindo === p.caminho ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ExternalLink size={14} aria-hidden />}
                    {p.abre ? "Abrir" : "Abrir um exemplo"}
                  </button>
                )}
                <Link to={p.tela} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Ir para onde se gera
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
