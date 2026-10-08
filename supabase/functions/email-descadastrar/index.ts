// Link "Não quero mais receber" dos e-mails para clientes.
// GET ?t=<token> (link no rodapé) ou POST (botão "cancelar inscrição" do Gmail/Outlook).
// Deploy com --no-verify-jwt.
import { adminClient } from "../_shared/supabase.ts";

const texto = (t: string, status = 200) =>
  new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto("Link inválido.", 400);
  const db = adminClient();
  const { data } = await db.from("clientes").update({ avisos_email: false }).eq("email_token", token).select("id");
  if (!data?.length) return texto("Link inválido ou expirado.", 404);
  return texto("Pronto! Você não vai mais receber nossos avisos por e-mail.\n\nSe mudar de ideia, é só pedir para a nossa equipe.");
});
