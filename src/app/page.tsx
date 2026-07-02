export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--background)]">
      <div className="text-center space-y-4 px-6">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[var(--green-600)] flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-4xl font-bold text-[var(--foreground)] tracking-tight">
            Tasa Directa
          </h1>
        </div>
        <p className="text-[var(--muted)] text-lg max-w-md mx-auto">
          Marketplace B2B exclusivo para Profesionales de Compra y Venta de Divisas (PCD)
          autorizados por la DIAN
        </p>
        <p className="text-[var(--green-600)] font-semibold tracking-widest text-sm uppercase">
          Seguridad y Confianza
        </p>
        <div className="pt-4 border-t border-[var(--border)] mt-6">
          <p className="text-xs text-[var(--muted)]">Plataforma en construcción</p>
        </div>
      </div>
    </main>
  );
}
