import type { ReactNode } from 'react'

/** A titled stub standing in for a surface the later phases (R3–R6) build.
 *
 *  Step 2.1 lands the URL contract, not the views: every route in the spec's
 *  route map resolves today, so deep links can be proven end-to-end before the
 *  real screens exist. `data-route` is the handle the route-map tests assert on.
 *
 *  A plain <div>, not a <main>: since Step 2.3 the AppShell owns the `main`
 *  landmark, and nesting a second one inside it is invalid.
 */
export function Placeholder({
  route,
  title,
  children,
}: {
  route: string
  title: string
  children?: ReactNode
}) {
  return (
    <div
      data-route={route}
      className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">This surface is being assembled.</p>
      {children}
    </div>
  )
}
