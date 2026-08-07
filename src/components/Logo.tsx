import { cn } from "@/utils/cn";

/**
 * Logo "Vem Pra Porto" — onda do mar + sol do pôr do sol.
 * Pode ser usada como ícone (showText=false) ou com o nome da empresa.
 */
export function LogoMarca({
  size = 40,
  showText = true,
  className,
  textClassName,
  subClassName,
  subtitulo = "Controle de vouchers",
}: {
  size?: number;
  showText?: boolean;
  className?: string;
  textClassName?: string;
  subClassName?: string;
  subtitulo?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoIcon size={size} />
      {showText && (
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-extrabold tracking-tight text-white", textClassName)}>
            Vem Pra Porto
          </p>
          <p className={cn("truncate text-[11px] text-sky-300", subClassName)}>
            {subtitulo}
          </p>
        </div>
      )}
    </div>
  );
}

/** Apenas o ícone da logo (onda + sol). */
export function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  const id = `logo-grad-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Vem Pra Porto"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="#0369A1" />
          <stop offset="100%" stopColor="#164E63" />
        </linearGradient>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Fundo arredondado */}
      <rect width="100" height="100" rx="22" fill={`url(#${id})`} />

      {/* Reflexo sutil */}
      <ellipse cx="50" cy="92" rx="38" ry="6" fill="white" opacity="0.08" />

      {/* Sol dourado */}
      <circle cx="68" cy="26" r="13" fill={`url(#${id}-sun)`} />
      <circle cx="68" cy="26" r="9" fill="#FDE68A" opacity="0.6" />

      {/* Raios do sol */}
      <g stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <line x1="68" y1="8" x2="68" y2="4" />
        <line x1="82" y1="14" x2="85" y2="11" />
        <line x1="86" y1="26" x2="90" y2="26" />
        <line x1="82" y1="38" x2="85" y2="41" />
        <line x1="54" y1="14" x2="51" y2="11" />
      </g>

      {/* Ondas do mar */}
      <path
        d="M4 58 C16 46, 30 70, 44 58 C58 46, 72 70, 86 58 L96 58"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M4 70 C16 58, 30 82, 44 70 C58 58, 72 82, 86 70 L96 70"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M4 80 C16 72, 30 90, 44 80 C58 72, 72 90, 86 80 L96 80"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.25"
      />

      {/* Barco pequeno */}
      <path
        d="M24 52 L34 52 L31 46 L27 46 Z"
        fill="white"
        opacity="0.9"
      />
      {/* Mastro */}
      <line x1="29" y1="46" x2="29" y2="38" stroke="white" strokeWidth="1.5" opacity="0.9" />
      {/* Vela */}
      <path d="M29 38 L29 44 L35 44 Z" fill="#FBBF24" opacity="0.85" />
    </svg>
  );
}
