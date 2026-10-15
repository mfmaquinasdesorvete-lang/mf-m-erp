// Licenciados da My Frost Sorveterias (a licenciadora): a MF fabrica as máquinas para eles. É uma etiqueta do cadastro
// do cliente (tipos de contato); a Venda de Máquinas e as propostas filtram por ela e mostram o selo ao lado do nome.
export const TAG_LICENCIADO = "licenciado_my_frost";

export const ehLicenciado = (c?: { tags?: string[] | null } | null) => !!c?.tags?.includes(TAG_LICENCIADO);

/** Tags do cliente com ou sem a etiqueta de licenciado (sem repetir e sem mexer nas outras). */
export function tagsComLicenciado(tags: string[] | null | undefined, marcar: boolean): string[] {
  const sem = (tags ?? []).filter((t) => t !== TAG_LICENCIADO);
  return marcar ? [...sem, TAG_LICENCIADO] : sem;
}

export function SeloLicenciado({ cliente }: { cliente?: { tags?: string[] | null } | null }) {
  if (!ehLicenciado(cliente)) return null;
  return (
    <span title="Licenciado My Frost Sorveterias" className="ml-1.5 inline-block whitespace-nowrap rounded-md bg-purple-100 px-1.5 py-0.5 align-middle text-[11px] font-bold text-purple-800">
      LICENCIADO
    </span>
  );
}
