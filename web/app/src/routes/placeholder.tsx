import type { ReactNode } from 'react'

import { CenteredState } from '@/components/centered-state'

/** A CenteredState stub standing in for a surface the later phases (R3–R6) build.
 *
 *  Step 2.1 landed the URL contract, not the views: every route in the spec's
 *  route map resolves today, so deep links can be proven end-to-end before the
 *  real screens exist. `data-route` is the handle the route-map tests assert on.
 *
 *  A plain <div>, not a <main>: since Step 2.3 the AppShell owns the `main`
 *  landmark, and nesting a second one inside it is invalid.
 */
export function Placeholder({
  route,
  title,
  icon,
  children,
}: {
  route: string
  title: string
  icon: ReactNode
  children?: ReactNode
}) {
  return (
    <div data-route={route} className="flex min-h-full flex-col">
      <CenteredState
        icon={icon}
        tone="neutral"
        title={title}
        subtitle="This surface arrives in a later phase of the redesign."
      >
        {children}
      </CenteredState>
    </div>
  )
}
