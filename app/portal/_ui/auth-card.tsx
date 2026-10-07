/** The centred card used by the portal's sign-in and set-password pages. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">Q</div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">{children}</div>
        {footer ? <p className="mt-4 text-center text-xs text-muted">{footer}</p> : null}
      </div>
    </main>
  );
}
