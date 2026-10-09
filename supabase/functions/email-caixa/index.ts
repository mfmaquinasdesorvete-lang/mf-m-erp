// Caixa de entrada de e-mail dentro do ERP.
// POST { acao: "sincronizar", conta_id? }                 -> busca e-mails novos (também pelo agendamento)
// POST { acao: "salvar_conta", conta }                    -> (admin) cria/edita a conta e testa a leitura e o envio
// POST { acao: "sugerir_servidor", email }                -> (admin) provedor e servidores certos para o e-mail
// POST { acao: "remover_conta", conta_id }                -> (admin)
// POST { acao: "anexo", email_id, indice }                -> conteúdo do anexo (base64)
// POST { acao: "importar_nfe", email_id, indice }         -> importa o XML anexo como NF-e de entrada
// POST { acao: "responder", email_id, texto }             -> responde pelo SMTP da conta
// POST { acao: "enviar", conta_id, para, assunto, texto } -> e-mail novo
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { baixarAnexo, type Conta, enviarPelaConta, mxDoDominio, sincronizarConta, sondarServidor, testarConta, testarSmtp } from "../_shared/email-caixa.ts";
import { explicarErroEmail, portaSmtpBloqueada, PROVEDORES, provedorPorDominio, provedorPorMx } from "../_shared/email-diagnostico.ts";
import { importarXml } from "../_shared/nfe-recebidas.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";

/** Provedor do e-mail: pelos domínios gratuitos conhecidos ou pelo registro MX do domínio da empresa. */
async function provedorDoEmail(email: string) {
  const dominio = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!dominio) return null;
  return provedorPorDominio(dominio) ?? provedorPorMx(await mxDoDominio(dominio));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const peloAgendamento = await chamadaDoAgendamento(req);

    const contas = async (id?: string) => {
      let q = db.from("email_contas").select("*").eq("ativo", true);
      if (id) q = q.eq("id", id);
      const { data } = await q;
      return (data ?? []) as Conta[];
    };

    // Diagnóstico de rede com os servidores de e-mail conhecidos (sem login): admin ou o agendamento do próprio banco
    if (body.acao === "sondar") {
      if (!peloAgendamento) await requireErpUser(req, []);
      const conhecidos = new Set(PROVEDORES.flatMap((p) => [`${p.imap}:${p.imap_porta}`, `${p.smtp}:465`]));
      const alvos = (Array.isArray(body.alvos) ? body.alvos : ["imap.hostinger.com:993", "imap.gmail.com:993"]).map(String).filter((a: string) => conhecidos.has(a)).slice(0, 4);
      const resultado = [];
      for (const a of alvos) { const [h, p] = a.split(":"); resultado.push(await sondarServidor(h, Number(p))); }
      return json({ ok: true, resultado });
    }

    if (peloAgendamento || body.acao === "sincronizar") {
      let lista = await contas(body.conta_id);
      if (!peloAgendamento) {
        const { userId } = await requireErpUser(req);
        const { data: u } = await db.from("usuarios_erp").select("papel").eq("user_id", userId).single();
        lista = lista.filter((c) => u?.papel === "admin" || c.papeis.includes(u?.papel));
      }
      const resultado: Record<string, number | string> = {};
      for (const c of lista) {
        try { resultado[c.nome] = await sincronizarConta(db, c); } catch (e) { resultado[c.nome] = `erro: ${(e as Error).message}`; }
      }
      return json({ ok: true, resultado });
    }

    // Servidores certos para o e-mail (pelo domínio e pelo registro MX)
    if (body.acao === "sugerir_servidor") {
      await requireErpUser(req, []);
      return json({ ok: true, provedor: await provedorDoEmail(String(body.email ?? "")) });
    }

    if (body.acao === "salvar_conta" || body.acao === "remover_conta") {
      await requireErpUser(req, []);
      if (body.acao === "remover_conta") {
        await db.from("email_contas").delete().eq("id", body.conta_id);
        return json({ ok: true });
      }
      const c = body.conta ?? {};
      const campos = {
        nome: String(c.nome ?? "").trim(), email: String(c.email ?? "").trim().toLowerCase(),
        imap_host: String(c.imap_host ?? "").trim(), imap_porta: Number(c.imap_porta) || 993,
        smtp_host: String(c.smtp_host ?? "").trim() || null, smtp_porta: Number(c.smtp_porta) || 465,
        usuario: String(c.usuario ?? c.email ?? "").trim(), unidade_id: c.unidade_id || null,
        papeis: Array.isArray(c.papeis) && c.papeis.length ? c.papeis : ["vendas", "financeiro"], ativo: c.ativo !== false,
      };
      if (!campos.nome || !campos.email || !campos.imap_host) throw new HttpError(400, "preencha nome, e-mail e servidor IMAP");
      let senha: string | undefined = c.senha || undefined;
      if (!senha && c.id) senha = (await db.from("email_contas").select("senha").eq("id", c.id).single()).data?.senha;
      if (!senha) throw new HttpError(400, "informe a senha do e-mail");
      senha = senha.trim();
      const provedor = await provedorDoEmail(campos.email);
      // senha de app do Google/Yahoo vem em grupos ("abcd efgh ijkl mnop"): vale sem os espaços
      if (/^[a-z]{4}( [a-z]{4}){3}$/i.test(senha)) senha = senha.replace(/ /g, "");
      if (campos.smtp_host && portaSmtpBloqueada(campos.smtp_porta)) campos.smtp_porta = 465; // 25 e 587 são bloqueadas no Supabase
      const falhou = (etapa: "imap" | "smtp", host: string, porta: number, e: unknown): never => {
        const x = e as { code?: string; message?: string; responseText?: string; response?: string; authenticationFailed?: boolean };
        console.warn("email-caixa: teste falhou", JSON.stringify({ etapa, host, porta, provedor: provedor?.id ?? null, code: x?.code ?? null,
          auth: x?.authenticationFailed ?? null, mensagem: String(x?.message ?? "").slice(0, 200), resposta: String(x?.responseText ?? x?.response ?? "").slice(0, 200) }));
        const texto = explicarErroEmail(e, { etapa, host, porta, provedor });
        throw new HttpError(400, etapa === "imap" ? `Não consegui entrar na caixa. ${texto}` : `A leitura funcionou, mas o envio não. ${texto}`);
      };
      try { await testarConta({ ...campos, senha }); } catch (e) { falhou("imap", campos.imap_host, campos.imap_porta, e); }
      if (campos.smtp_host) {
        try { await testarSmtp({ ...campos, senha }); } catch (e) { falhou("smtp", campos.smtp_host, campos.smtp_porta, e); }
      }
      const { data, error } = c.id
        ? await db.from("email_contas").update({ ...campos, senha }).eq("id", c.id).select("id").single()
        : await db.from("email_contas").insert({ ...campos, senha }).select("id").single();
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, id: data.id });
    }

    // Ações sobre um e-mail: só quem pode ver a caixa
    const { userId } = await requireErpUser(req);
    const { data: u } = await db.from("usuarios_erp").select("papel").eq("user_id", userId).single();
    const contaPermitida = async (id: string) => {
      const [c] = await contas(id);
      if (!c || (u?.papel !== "admin" && !c.papeis.includes(u?.papel))) throw new HttpError(403, "sem acesso a esta caixa");
      return c;
    };
    const carregarEmail = async () => {
      const { data: e } = await db.from("emails").select("*").eq("id", body.email_id).single();
      if (!e) throw new HttpError(404, "e-mail não encontrado");
      return { e, conta: await contaPermitida(e.conta_id) };
    };

    switch (body.acao) {
      case "anexo": {
        const { e, conta } = await carregarEmail();
        const a = await baixarAnexo(conta, Number(e.uid), Number(body.indice));
        return json({ ok: true, nome: a.nome, tipo: a.tipo, base64: encodeBase64(a.conteudo) });
      }
      case "importar_nfe": {
        if (!["admin", "financeiro"].includes(u?.papel)) throw new HttpError(403, "só o financeiro importa notas");
        const { e, conta } = await carregarEmail();
        const a = await baixarAnexo(conta, Number(e.uid), Number(body.indice));
        const r = await importarXml(db, new TextDecoder().decode(a.conteudo));
        const { data } = await db.from("nfe_recebidas").select("processamento, processamento_msg").eq("id", r.id).single();
        return json({ ok: true, ...r, ...data });
      }
      case "responder": {
        const { e, conta } = await carregarEmail();
        const texto = String(body.texto ?? "").trim();
        if (!texto) throw new HttpError(400, "escreva a resposta");
        const citacao = (e.texto ?? "").split("\n").slice(0, 40).map((l: string) => `> ${l}`).join("\n");
        await enviarPelaConta(conta, {
          para: e.de_email, assunto: /^re:/i.test(e.assunto ?? "") ? e.assunto : `Re: ${e.assunto ?? ""}`,
          texto: `${texto}\n\nEm ${new Date(e.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}, ${e.de_nome ?? e.de_email} escreveu:\n${citacao}`,
          responderA: e.message_id,
        });
        await db.from("emails").update({ respondido_em: new Date().toISOString(), lido: true }).eq("id", e.id);
        return json({ ok: true });
      }
      case "enviar": {
        const conta = await contaPermitida(body.conta_id);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.para ?? ""))) throw new HttpError(400, "e-mail do destinatário inválido");
        await enviarPelaConta(conta, { para: body.para, assunto: String(body.assunto ?? "").trim() || "(sem assunto)", texto: String(body.texto ?? "") });
        return json({ ok: true });
      }
      default:
        throw new HttpError(400, "ação inválida");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
