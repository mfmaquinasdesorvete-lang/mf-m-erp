// Gestão de usuários do ERP (somente admin).
// POST { acao: "listar" }
// POST { acao: "criar", email, nome, papel, senha }
// POST { acao: "atualizar", user_id, nome?, papel?, ativo? }
// POST { acao: "redefinir_senha", user_id, senha }
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";

const PAPEIS = ["admin", "vendas", "financeiro", "tecnico", "contador"];

function validarSenha(senha: unknown) {
  if (typeof senha !== "string" || senha.length < 8) throw new HttpError(400, "a senha precisa ter ao menos 8 caracteres");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId } = await requireErpUser(req, []);
    const body = await req.json();
    const db = adminClient();

    switch (body.acao) {
      case "listar": {
        const [{ data: perfis }, { data: auth }] = await Promise.all([
          db.from("usuarios_erp").select("*").order("nome"),
          db.auth.admin.listUsers({ perPage: 1000 }),
        ]);
        const emails = new Map(auth.users.map((u) => [u.id, { email: u.email, ultimo_acesso: u.last_sign_in_at }]));
        return json({ ok: true, usuarios: (perfis ?? []).map((p) => ({ ...p, ...emails.get(p.user_id) })) });
      }

      case "criar": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) throw new HttpError(400, "e-mail inválido");
        if (!PAPEIS.includes(body.papel)) throw new HttpError(400, "papel inválido");
        if (!String(body.nome ?? "").trim()) throw new HttpError(400, "informe o nome");
        validarSenha(body.senha);

        const { data, error } = await db.auth.admin.createUser({ email, password: body.senha, email_confirm: true });
        if (error) throw new HttpError(400, error.message.includes("already") ? "já existe um usuário com este e-mail" : error.message);
        const { error: e2 } = await db.from("usuarios_erp").insert({ user_id: data.user.id, nome: body.nome.trim(), papel: body.papel });
        if (e2) {
          await db.auth.admin.deleteUser(data.user.id);
          throw new HttpError(500, e2.message);
        }
        return json({ ok: true });
      }

      case "atualizar": {
        const patch: Record<string, unknown> = {};
        if (body.nome !== undefined) patch.nome = String(body.nome).trim();
        if (body.papel !== undefined) {
          if (!PAPEIS.includes(body.papel)) throw new HttpError(400, "papel inválido");
          patch.papel = body.papel;
        }
        if (body.ativo !== undefined) patch.ativo = !!body.ativo;
        if (body.user_id === userId && (patch.ativo === false || (patch.papel && patch.papel !== "admin"))) {
          throw new HttpError(400, "você não pode desativar nem tirar o próprio acesso de administrador");
        }
        const { error } = await db.from("usuarios_erp").update(patch).eq("user_id", body.user_id);
        if (error) throw new HttpError(500, error.message);
        // Desativado não consegue mais entrar (o acesso aos dados já é bloqueado pelo RLS).
        if (patch.ativo !== undefined) {
          await db.auth.admin.updateUserById(body.user_id, { ban_duration: patch.ativo ? "none" : "876000h" });
        }
        return json({ ok: true });
      }

      case "redefinir_senha": {
        validarSenha(body.senha);
        const { error } = await db.auth.admin.updateUserById(body.user_id, { password: body.senha });
        if (error) throw new HttpError(400, error.message);
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
