import { NavLink } from "@/components/shell/nav-link";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vendors", label: "Vendors" },
  { href: "/documents", label: "Documents" },
];

export default function DocFlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 border-r bg-background md:flex md:flex-col">
          <div className="px-6 pb-8 pt-8">
            <p className="text-xl font-bold tracking-tight text-brand">Docentra<span aria-hidden="true">.</span></p>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              DocFlow workspace
            </p>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-2 px-3">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <p className="border-t p-4 text-xs text-muted-foreground">
            Local development build
          </p>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b bg-background md:hidden">
            <details className="group">
              <summary aria-label="Main menu" className="flex min-h-16 cursor-pointer list-none items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-lg font-bold text-brand">Docentra.</span>
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                    DocFlow
                  </span>
                </span>
                <span aria-hidden="true" className="rounded-md border px-3 py-2 text-sm font-medium group-open:bg-muted">
                  Menu <span className="ml-1 group-open:hidden">+</span><span className="ml-1 hidden group-open:inline">−</span>
                </span>
              </summary>
              <nav aria-label="Main" className="space-y-1 border-t p-3">
                {NAV.map((item) => (
                  <NavLink key={item.href} href={item.href}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </details>
          </header>

          <main id="main" tabIndex={-1} className="min-w-0 px-4 py-7 sm:px-6 md:px-8 md:py-10 lg:px-10">
            {children}
          </main>
        </div>
      </div>

      <footer className="border-t bg-background">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground md:px-8">
          Docentra · DocFlow — demonstration data, no currency configured.
        </p>
      </footer>
    </div>
  );
}
