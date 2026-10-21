// Gestão de usuários do ERP (somente admin).
// POST { acao: "listar" }
// POST { acao: "criar", email, nome, papel, senha, papeis_extras?, cargo?, telefone?, unidade_id? }
// POST { acao: "atualizar", user_id, nome?, email?, papel?, papeis_extras?, cargo?, telefone?, unidade_id?, ativo? }
// POST { acao: "redefinir_senha", user_id, senha }
// A senha definida aqui é provisória: a pessoa troca no próximo acesso (usuarios_erp.trocar_senha).
// "Sempre um administrador ativo" é garantido também no banco (gatilho trg_usuarios_ultimo_admin).
// Administradores (criar, promover, alterar, trocar a senha) só pela conta master (gatilho trg_usuarios_master).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";

const PAPEIS = ["admin", "vendas", "financeiro", "tecnico", "contador", "expedicao", "marketplace", "compras", "giga"];
const ADICIONAIS = ["vendas", "financeiro", "tecnico", "expedicao", "marketplace", "compras"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarSenha(senha: unknown) {
  if (typeof senha !== "string" || senha.length < 8) throw new HttpError(400, "a senha precisa ter ao menos 8 caracteres");
}
function extras(v: unknown, papel?: string) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((p) => !ADICIONAIS.includes(p))) throw new HttpError(400, "papéis adicionais inválidos");
  return [...new Set(v as string[])].filter((p) => p !== papel);
}
const texto = (v: unknown, max: number) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, max) || null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId } = await requireErpUser(req, []);
    const body = await req.json();
    const db = adminClient();
    // administradores (criar, promover, mudar ou trocar a senha de um) só pela conta master
    const souMaster = async () => !!(await db.from("usuarios_erp").select("master").eq("user_id", userId).maybeSingle()).data?.master;
    const exigirMaster = async () => { if (!(await souMaster())) throw new HttpError(403, "só a conta master cria ou altera administradores"); };

    switch (body.acao) {
      case "listar": {
        const [{ data: perfis }, { data: auth }] = await Promise.all([
          db.from("usuarios_erp").select("user_id, nome, papel, papeis_extras, cargo, telefone, unidade_id, ativo, trocar_senha, created_at, master").order("nome"),
          db.auth.admin.listUsers({ perPage: 1000 }),
        ]);
        const contas = new Map(auth.users.map((u) => [u.id, { email: u.email, ultimo_acesso: u.last_sign_in_at }]));
        return json({ ok: true, usuarios: (perfis ?? []).map((p) => ({ ...p, ...contas.get(p.user_id) })) });
      }

      case "criar": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!EMAIL.test(email)) throw new HttpError(400, "e-mail inválido");
        if (!PAPEIS.includes(body.papel)) throw new HttpError(400, "papel inválido");
        const nome = texto(body.nome, 120);
        if (!nome) throw new HttpError(400, "informe o nome");
        validarSenha(body.senha);
        if (body.papel === "admin") await exigirMaster();

        const { data, error } = await db.auth.admin.createUser({ email, password: body.senha, email_confirm: true, user_metadata: { nome } });
        if (error) throw new HttpError(400, /already|registered|exists/i.test(error.message) ? "já existe um usuário com este e-mail" : error.message);
        const { error: e2 } = await db.from("usuarios_erp").insert({
          user_id: data.user.id, nome, papel: body.papel, papeis_extras: extras(body.papeis_extras, body.papel) ?? [],
          cargo: texto(body.cargo, 80) ?? null, telefone: onlyDigits(body.telefone).slice(0, 13) || null,
          unidade_id: body.unidade_id || null, trocar_senha: true,
        });
        if (e2) {
          await db.auth.admin.deleteUser(data.user.id);
          throw new HttpError(500, e2.message);
        }
        return json({ ok: true, user_id: data.user.id });
      }

      case "atualizar": {
        if (!body.user_id) throw new HttpError(400, "usuário não informado");
        const { data: atual } = await db.from("usuarios_erp").select("papel, ativo").eq("user_id", body.user_id).maybeSingle();
        if (!atual) throw new HttpError(404, "usuário não encontrado");
        if (atual.papel === "admin" || body.papel === "admin") await exigirMaster();
        const patch: Record<string, unknown> = {};
        if (body.nome !== undefined) {
          patch.nome = texto(body.nome, 120);
          if (!patch.nome) throw new HttpError(400, "informe o nome");
        }
        if (body.papel !== undefined) {
          if (!PAPEIS.includes(body.papel)) throw new HttpError(400, "papel inválido");
          patch.papel = body.papel;
        }
        const ex = extras(body.papeis_extras, (patch.papel as string) ?? atual.papel);
        if (ex !== undefined) patch.papeis_extras = ex;
        if (body.cargo !== undefined) patch.cargo = texto(body.cargo, 80);
        if (body.telefone !== undefined) patch.telefone = onlyDigits(body.telefone).slice(0, 13) || null;
        if (body.unidade_id !== undefined) patch.unidade_id = body.unidade_id || null;
        if (body.ativo !== undefined) patch.ativo = !!body.ativo;
        if (body.user_id === userId && (patch.ativo === false || (patch.papel && patch.papel !== "admin"))) {
          throw new HttpError(400, "você não pode desativar nem tirar o próprio acesso de administrador");
        }
        // e-mail de acesso: troca na conta (já confirmado, a pessoa entra com o novo)
        if (body.email !== undefined) {
          const email = String(body.email ?? "").trim().toLowerCase();
          if (!EMAIL.test(email)) throw new HttpError(400, "e-mail inválido");
          const { error } = await db.auth.admin.updateUserById(body.user_id, { email, email_confirm: true });
          if (error) throw new HttpError(400, /already|registered|exists/i.test(error.message) ? "já existe um usuário com este e-mail" : error.message);
        }
        if (Object.keys(patch).length) {
          const { error } = await db.from("usuarios_erp").update(patch).eq("user_id", body.user_id);
          if (error) throw new HttpError(400, error.message);
        }
        // Desativado não consegue mais entrar (o acesso aos dados já é bloqueado pelo RLS).
        if (patch.ativo !== undefined && patch.ativo !== atual.ativo) {
          await db.auth.admin.updateUserById(body.user_id, { ban_duration: patch.ativo ? "none" : "876000h" });
        }
        return json({ ok: true });
      }

      case "redefinir_senha": {
        validarSenha(body.senha);
        if (body.user_id !== userId) {
          const { data: alvo } = await db.from("usuarios_erp").select("papel").eq("user_id", body.user_id).maybeSingle();
          if (alvo?.papel === "admin") await exigirMaster();
        }
        const { error } = await db.auth.admin.updateUserById(body.user_id, { password: body.senha });
        if (error) throw new HttpError(400, error.message);
        if (body.user_id !== userId) await db.from("usuarios_erp").update({ trocar_senha: true }).eq("user_id", body.user_id);
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
