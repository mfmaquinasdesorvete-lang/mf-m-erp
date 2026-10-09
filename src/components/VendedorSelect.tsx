// Vendedor do pedido: os vendedores/representantes cadastrados e os usuários do ERP que ainda não são vendedores
// (escolher um usuário cria o cadastro de vendedor dele, com a comissão padrão das configurações).
import { useQuery } from "@tanstack/react-query";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import type { Vendedor } from "@/lib/types";

export type UsuarioVendedor = { user_id: string; nome: string; papel: string; vendedor_id: string | null };

export function useUsuariosVendedores() {
  return useQuery({
    queryKey: ["vendedores", "usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_vendedores");
      if (error) throw error;
      return (data ?? []) as UsuarioVendedor[];
    },
  });
}

export function VendedorSelect({ value, textoAntigo, disabled, onChange }: {
  value: string | null | undefined; textoAntigo?: string | null; disabled?: boolean;
  onChange: (vendedorId: string | null, nome: string | null) => void;
}) {
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: usuarios = [] } = useUsuariosVendedores();
  const invalidate = useInvalidate();
  const ativos = vendedores.filter((v) => v.ativo || v.id === value);
  const semCadastro = usuarios.filter((u) => !u.vendedor_id && !vendedores.some((v) => v.user_id === u.user_id));

  async function escolher(v: string) {
    if (!v) return onChange(null, null);
    if (!v.startsWith("u:")) return onChange(v, vendedores.find((x) => x.id === v)?.nome ?? null);
    const u = usuarios.find((x) => x.user_id === v.slice(2));
    const { data, error } = await supabase.rpc("vendedor_do_usuario", { p_user: v.slice(2) });
    if (error) return notifyError(error);
    invalidate("vendedores");
    onChange(data as string, u?.nome ?? null);
  }

  return (
    <select className="input" value={value ?? ""} disabled={disabled} onChange={(e) => escolher(e.target.value)}>
      <option value="">{textoAntigo && !value ? textoAntigo : "— sem vendedor"}</option>
      {ativos.length > 0 && (
        <optgroup label="Vendedores e representantes">
          {ativos.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.tipo === "representante" ? " (representante)" : ""}</option>)}
        </optgroup>
      )}
      {semCadastro.length > 0 && (
        <optgroup label="Usuários do ERP">
          {semCadastro.map((u) => <option key={u.user_id} value={`u:${u.user_id}`}>{u.nome}</option>)}
        </optgroup>
      )}
    </select>
  );
}
