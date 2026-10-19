// Configurações → painel: cada assunto num cartão com a situação dele e, no topo, o que precisa de atenção.
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, CreditCard, Paperclip, Upload, UserCog } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { useVisivel } from "@/lib/menu";
import { pendenciaCatalogo } from "@/lib/catalogo";
import { IconeSecao, SECOES, type SecaoId } from "./comum";
import { pl } from "@/lib/format";

type Situacao = { texto: string; ok?: boolean };

export function PainelConfig() {
  const { data: cfg } = useConfig();
  const { unidades } = useUnidade();
  const { tem } = usePerfil();
  const vis = useVisivel();
  const { data: produtos = [] } = useRows<{ id: string; ativo: boolean; no_catalogo?: boolean; foto_caminho?: string | null; preco_venda: number }>("produtos",
    { select: "id, ativo, no_catalogo, foto_caminho, preco_venda", key: ["config"] });
  const { data: avisos = [] } = useRows<{ tipo: string; ativo: boolean }>("avisos_tipos", { select: "tipo, ativo", order: "tipo", key: ["config"] });
  const { data: regrasDesc = [] } = useRows<{ ativo: boolean }>("regras_desconto", { select: "ativo", order: "canal", key: ["config"] });
  const { data: regua = [] } = useRows<{ ativo: boolean; canal_email: boolean; canal_whatsapp: boolean }>("regua_cobranca", { select: "ativo, canal_email, canal_whatsapp", order: "ordem", key: ["config"] });
  const { data: backups = [] } = useRows<{ status: string; created_at: string }>("backups_registro", { select: "status, created_at", order: "created_at", ascending: false, key: ["config"] });
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;

  const u = unidades as (typeof unidades[number] & Record<string, any>)[];
  const incompletas = u.filter((x) => !x.cnpj || !x.inscricao_estadual || !x.logradouro || !x.cep);
  const comPix = u.filter((x) => x.pix_chave).length, comLink = u.filter((x) => x.infinitepay_tag).length;
  const marcados = produtos.filter((p) => p.ativo && p.no_catalogo);
  const prontos = marcados.filter((p) => !pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda })).length;
  const ultimoBackup = backups.find((b) => b.status === "ok");
  const backupAtrasado = tem("financeiro") && (!ultimoBackup || Date.now() - Date.parse(ultimoBackup.created_at) > 30 * 3600_000);
  const imp = cfg.impressora_etiqueta ?? {};

  const situacao: Record<SecaoId, Situacao> = {
    empresa: cfg.logo_url ? { texto: "Logo e marca definidas", ok: true } : { texto: "Sem logo: os PDFs usam a padrão", ok: false },
    unidades: incompletas.length ? { texto: `${incompletas.map((x) => x.nome).join(", ")}: falta CNPJ, IE ou endereço`, ok: false } : { texto: `${u.length} ${pl(u.length, "unidade", "unidades")} prontas para NF-e`, ok: true },
    recebimentos: { texto: `Pix em ${comPix} de ${u.length} · link InfinitePay em ${comLink} de ${u.length}`, ok: comPix === u.length && u.length > 0 },
    bancos: { texto: "Extrato que chega sozinho: Open Finance, API do Inter e OFX por e-mail" },
    orcamentos: { texto: `Validade ${cfg.validade_orcamento_dias ?? "—"} dias · garantia ${cfg.garantia_meses_padrao ?? "—"} meses · conserto ${cfg.garantia_servico_dias ?? 90} dias` },
    descontos: { texto: regrasDesc.length ? `${regrasDesc.filter((r) => r.ativo).length} ${pl(regrasDesc.filter((r) => r.ativo).length, "regra", "regras")} de desconto máximo` : "Sem limite de desconto" },
    comissoes: { texto: `${Number(cfg.comissao_percentual ?? 0).toLocaleString("pt-BR")}% padrão · regras em Comissões` },
    catalogo: { texto: `${prontos} na vitrine${marcados.length - prontos ? ` · ${marcados.length - prontos} faltando foto ou preço` : ""}`, ok: marcados.length - prontos === 0 },
    pedidos: { texto: `NF-e automática ${cfg.nfe_automatica ? "ligada" : "desligada"} · etiqueta ${cfg.etiqueta_formato === "a4" ? "A4" : "10 x 15"}${imp.modelo ? ` · ${imp.modelo}` : ""}` },
    notas: { texto: `Presença do comprador: ${({ 1: "presencial", 2: "internet", 3: "teleatendimento", 9: "não presencial" } as Record<number, string>)[Number(cfg.presenca_comprador ?? 9)] ?? "—"}${cfg.entrada_automatica_estoque ? " · entrada automática das notas de compra" : ""}` },
    cobranca: (() => {
      const l = regua.filter((e) => e.ativo);
      return l.length ? { texto: `${l.length} ${pl(l.length, "etapa ligada", "etapas ligadas")} · e-mail em ${l.filter((e) => e.canal_email).length} · WhatsApp em ${l.filter((e) => e.canal_whatsapp).length}` } : { texto: "Régua desligada: nenhum lembrete sai sozinho", ok: false };
    })(),
    avisos: { texto: `${avisos.filter((a) => a.ativo).length} de ${avisos.length} avisos ligados` },
    email: { texto: cfg.avisos_email_ativo ? "E-mails automáticos para os clientes ligados" : "E-mails automáticos para os clientes desligados" },
    contador: cfg.contador_envio_auto ? { texto: `Fechamento enviado sozinho todo dia ${cfg.contador_envio_dia ?? 5}`, ok: !!cfg.contador_email } : { texto: "Envio automático desligado" },
    cadastros: { texto: "Criar, renomear e organizar categorias e marcadores" },
    dados: tem("financeiro")
      ? (ultimoBackup ? { texto: `Último backup: ${new Date(ultimoBackup.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`, ok: !backupAtrasado } : { texto: "Nenhum backup registrado", ok: false })
      : { texto: "Exportar dados e apagar testes" },
  };

  const atencao = [
    !cfg.logo_url && { id: "empresa", texto: "Envie a logo da empresa (sai nos PDFs e na vitrine)" },
    incompletas.length > 0 && { id: "unidades", texto: `Complete o cadastro de ${incompletas.map((x) => x.nome).join(" e ")} para emitir NF-e` },
    u.some((x) => !x.pix_chave) && { id: "recebimentos", texto: `Cadastre a chave Pix de ${u.filter((x) => !x.pix_chave).map((x) => x.nome).join(" e ")} (Pix copia e cola nas cobranças)` },
    marcados.length - prontos > 0 && { id: "catalogo", texto: `${marcados.length - prontos} ${pl(marcados.length - prontos, "produto", "produtos")} do catálogo sem foto ou preço` },
    backupAtrasado && { id: "dados", texto: "O backup diário não roda há mais de um dia" },
    cfg.contador_envio_auto && !cfg.contador_email && { id: "contador", texto: "Envio ao contador ligado, mas sem e-mail do contador" },
  ].filter(Boolean) as { id: SecaoId; texto: string }[];

  const grupos = [...new Set(SECOES.map((s) => s.grupo))];
  const outras = [
    { to: "/usuarios", tela: "usuarios" as const, titulo: "Usuários e permissões", resumo: "Quem entra no ERP, o papel de cada um e o que cada perfil vê", icone: UserCog, cor: "from-[#64748b] to-[#334155]" },
    { to: "/importar", tela: "importar" as const, titulo: "Importar dados", resumo: "Tiny, planilhas, XML de notas, extrato do banco e base da My Frost num lugar só", icone: Upload, cor: "from-[#0ea5e9] to-[#2563eb]" },
    { to: "/implantacao", tela: "implantacao" as const, titulo: "Troca do Tiny", resumo: "Etapas, prazos e uso do ERP na virada do Tiny para o ERP Line", icone: ClipboardCheck, cor: "from-[#14b8a6] to-[#0f766e]" },
    { to: "/formas-pagamento", tela: "financeiro" as const, titulo: "Formas de pagamento", resumo: "Pix, boleto, cartão: parcelas, prazo e taxa de cada uma", icone: CreditCard, cor: "from-[#f59e0b] to-[#b45309]" },
    // saiu do Início do menu (é mais de uso pessoal): fica aqui e na busca do menu
    { to: "/documentos", tela: "documentos" as const, titulo: "Documentos (Docs)", resumo: "Os anexos de pedidos, OS, clientes, fornecedores, contas e produtos num lugar só", icone: Paperclip, cor: "from-[#6366f1] to-[#4338ca]" },
  ].filter((o) => vis.ve(o.tela, o.to));
  return (
    <div className="max-w-6xl">
      <PageHeader title="Configurações" subtitle="Toque num cartão para abrir. Cada assunto tem sua página." />
      {atencao.length > 0 && (
        <Card className="mb-5 border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><CircleAlert size={18} aria-hidden /> Precisa de atenção ({atencao.length})</h2>
          <ul className="space-y-1.5">
            {atencao.map((a) => (
              <li key={a.texto}><Link to={`/configuracoes/${a.id}`} className="flex items-center gap-1 text-sm text-amber-900 hover:underline"><ChevronRight size={14} aria-hidden /> {a.texto}</Link></li>
            ))}
          </ul>
        </Card>
      )}
      <div className="space-y-6">
        {/* telas que saíram do menu e ficam aqui, na engrenagem */}
        {outras.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Acessos e listas</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {outras.map((o) => (
                <Link key={o.to} to={o.to} className="group flex gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${o.cor} text-white shadow-card`} aria-hidden><o.icone size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 font-semibold text-fg">{o.titulo}<ChevronRight size={16} className="shrink-0 text-slate-400 group-hover:text-brand" aria-hidden /></span>
                    <span className="block text-sm text-slate-500">{o.resumo}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {grupos.map((g) => (
          <section key={g}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SECOES.filter((s) => s.grupo === g).map((s) => {
                const st = situacao[s.id];
                return (
                  <Link key={s.id} to={`/configuracoes/${s.id}`} className="group flex gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand">
                    <IconeSecao s={s} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 font-semibold text-fg">{s.titulo}<ChevronRight size={16} className="shrink-0 text-slate-400 group-hover:text-brand" aria-hidden /></span>
                      <span className="block text-sm text-slate-500">{s.resumo}</span>
                      <span className={`mt-1.5 flex items-start gap-1 text-xs font-semibold ${st.ok === false ? "text-amber-700" : st.ok ? "text-emerald-700" : "text-slate-600"}`}>
                        {st.ok === false ? <CircleAlert size={13} className="mt-px shrink-0" aria-hidden /> : st.ok ? <CheckCircle2 size={13} className="mt-px shrink-0" aria-hidden /> : null}
                        <span className="min-w-0">{st.texto}</span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
