// Foto do usuário (Configurações → Usuários e o menu): a foto, se houver, senão as iniciais.
// A foto é reduzida aqui mesmo (quadrada, 192 px, JPEG): fica com uns 10 KB e é guardada no cadastro (usuarios_erp.foto).

export const iniciaisDe = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export function FotoUsuario({ nome, foto, tamanho = 40, className = "" }: { nome: string; foto?: string | null; tamanho?: number; className?: string }) {
  const estilo = { width: tamanho, height: tamanho };
  return foto
    ? <img src={foto} alt="" aria-hidden style={estilo} className={`shrink-0 rounded-full object-cover ${className}`} />
    : <span style={{ ...estilo, fontSize: Math.round(tamanho * 0.36) }} className={`grid shrink-0 place-items-center rounded-full font-bold ${className}`} aria-hidden>{iniciaisDe(nome)}</span>;
}

/** Recorta o centro da imagem num quadrado e reduz para `lado` px (JPEG). */
export async function reduzirFoto(arquivo: File, lado = 192): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha uma imagem (foto JPG ou PNG)");
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não deu para abrir esta imagem"));
      i.src = url;
    });
    const menor = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = lado; c.height = lado;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - menor) / 2, (img.naturalHeight - menor) / 2, menor, menor, 0, 0, lado, lado);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
