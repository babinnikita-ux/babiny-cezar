import type { ReactNode } from 'react'

/** A titled stub standing in for a surface the later phases (R3–R6) build.
 *
 *  Step 2.1 lands the URL contract, not the views: every route in the spec's
 *  route map resolves today, so deep links can be proven end-to-end before the
 *  real screens exist. `data-route` is the handle the route-map tests assert on.
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
    <main
      data-route={route}
      className="flex h-full flex-col items-center justify-center gap-2 bg-background px-6 text-center text-foreground"
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">This surface is being assembled.</p>
      {children}
    </main>
  )
}
