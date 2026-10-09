// Entrega da fila public.avisos (Telegram para a equipe, e-mail para clientes).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { type Empresa, htmlEmail, mensagemCliente, textoEmail, textoTelegram } from "./avisos-modelos.ts";
import { chatPerdido, enviarTelegram } from "./telegram.ts";
import { enviarEmail } from "./email.ts";
import { prepararCobranca } from "./cobranca.ts";

export async function empresaDoErp(db: SupabaseClient): Promise<Empresa & { responder: string | null }> {
  const { data: c } = await db.from("configuracoes").select("*").eq("id", 1).single();
  return {
    nome: c?.nome_fantasia || c?.razao_social || "MF Máquinas",
    telefone: c?.telefone, whatsapp: c?.whatsapp, email: c?.email, endereco: c?.endereco,
    municipio: c?.municipio, uf: c?.uf, site: Deno.env.get("ERP_SITE_URL") ?? null,
    responder: c?.email_responder_para || c?.email || null,
  };
}

export const linkDescadastro = (token: string) =>
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-descadastrar?t=${token}`;

export const logoEmail = (empresa: Empresa) => (empresa.site ? `${empresa.site.replace(/\/$/, "")}/logo-192.png` : null);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function entregarFila(db: SupabaseClient, limite = 40) {
  const { data: lote, error } = await db.rpc("avisos_reservar", { p_limite: limite });
  if (error) throw new Error(error.message);
  const avisos = (lote ?? []) as any[];
  if (!avisos.length) return { enviados: 0, erros: 0 };

  const empresa = await empresaDoErp(db);
  const idsUsuarios = [...new Set(avisos.map((a) => a.usuario_id).filter(Boolean))];
  const idsClientes = [...new Set(avisos.map((a) => a.cliente_id).filter(Boolean))];
  const { data: usuarios } = idsUsuarios.length
    ? await db.from("usuarios_erp").select("user_id, nome, papel, ativo, telegram_chat_id").in("user_id", idsUsuarios)
    : { data: [] };
  const { data: clientes } = idsClientes.length
    ? await db.from("clientes").select("id, avisos_email, email_token").in("id", idsClientes)
    : { data: [] };
  const usuario = new Map((usuarios ?? []).map((u: any) => [u.user_id, u]));
  const cliente = new Map((clientes ?? []).map((c: any) => [c.id, c]));

  let enviados = 0, erros = 0;
  for (const a of avisos) {
    try {
      if (a.canal === "telegram") {
        const u = usuario.get(a.usuario_id);
        if (!u?.ativo || String(u.telegram_chat_id) !== a.destino) throw new Desistir("pessoa desconectou o Telegram ou foi desativada");
        await enviarTelegram(a.destino, textoTelegram(a.tipo, a.dados, { nome: u.nome, papel: u.papel, site: empresa.site }));
      } else {
        const c = cliente.get(a.cliente_id);
        if (!c?.avisos_email) throw new Desistir("cliente pediu para não receber e-mails");
        const m = mensagemCliente(a.tipo, a.tipo === "cli_cobranca" ? prepararCobranca(a.dados, empresa.nome) : a.dados, empresa);
        const sair = linkDescadastro(c.email_token);
        await enviarEmail({
          para: a.destino, assunto: m.assunto, html: htmlEmail(m, empresa, sair, logoEmail(empresa)), texto: textoEmail(m, empresa, sair),
          responderPara: empresa.responder, descadastro: sair, idempotencia: `aviso-${a.id}`,
        });
        await espera(550); // limite padrão do Resend: 2 envios por segundo
      }
      await db.from("avisos").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", a.id);
      enviados++;
    } catch (e) {
      erros++;
      const definitivo = e instanceof Desistir || chatPerdido(e);
      if (chatPerdido(e)) await db.from("usuarios_erp").update({ telegram_chat_id: null }).eq("telegram_chat_id", a.destino);
      await db.from("avisos").update({
        status: "erro", erro: (e as Error).message.slice(0, 500), ...(definitivo ? { tentativas: 99 } : {}),
      }).eq("id", a.id);
    }
  }
  return { enviados, erros };
}

class Desistir extends Error {}
