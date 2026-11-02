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
    <div className="min-h-screen bg-muted/40">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-background md:flex md:flex-col">
          <div className="border-b px-5 py-5">
            <p className="text-lg font-semibold tracking-tight">Docentra</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              DocFlow
            </p>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-1 p-3">
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
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Docentra</span>
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                    DocFlow
                  </span>
                </span>
                <span aria-hidden="true" className="text-sm text-muted-foreground">
                  Menu
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

          <main id="main" className="px-4 py-6 md:px-8 md:py-10">
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
