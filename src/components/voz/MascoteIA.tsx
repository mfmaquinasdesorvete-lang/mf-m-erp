// Bonequinho da ajuda de IA (24/10): um robozinho sorrindo dentro de uma bolha lisa na cor da marca.
// Desenho próprio (SVG), sem imagem: acompanha a cor da marca escolhida na aparência.
export function MascoteIA({ className = "" }: { className?: string }) {
  return (
    <span className={`relative grid place-items-center rounded-full bg-brand text-white ${className}`}>
      <svg viewBox="0 0 32 32" className="h-[72%] w-[72%]" aria-hidden>
        {/* antena */}
        <line x1="16" y1="4.5" x2="16" y2="8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="3.8" r="2" fill="#fde68a" />
        {/* orelhas */}
        <rect x="3.2" y="14" width="3" height="6.5" rx="1.5" fill="currentColor" opacity=".85" />
        <rect x="25.8" y="14" width="3" height="6.5" rx="1.5" fill="currentColor" opacity=".85" />
        {/* cabeça */}
        <rect x="6" y="8.5" width="20" height="17" rx="6" fill="currentColor" />
        {/* visor */}
        <rect x="8.6" y="11.5" width="14.8" height="9.5" rx="4.6" fill="#1e1b4b" />
        {/* olhos e sorriso */}
        <circle cx="12.9" cy="15.3" r="1.7" fill="#67e8f9" />
        <circle cx="19.1" cy="15.3" r="1.7" fill="#67e8f9" />
        <path d="M13.4 18.4q2.6 1.8 5.2 0" stroke="#67e8f9" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* bochechas */}
        <circle cx="8" cy="22.6" r="1.1" fill="#f9a8d4" />
        <circle cx="24" cy="22.6" r="1.1" fill="#f9a8d4" />
      </svg>
    </span>
  );
}
