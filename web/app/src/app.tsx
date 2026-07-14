import { BrowserRouter } from 'react-router'
import { AppShell } from './components/app-shell'
import { ThemeProvider } from './components/theme-provider'
import { AppRoutes } from './routes'

/** Real URLs, no basename: the cockpit is always mounted at the origin root, and the server
 *  serves index.html for every non-/api GET (src/server/static-ui.ts), so a deep link like
 *  `/tasks/:id/changes` cold-loads and survives a refresh.
 *
 *  AppShell is inside BrowserRouter because its nav reads the current location.
 *
 *  Its data props (repo chip, inbox badge, version) are deliberately unset: the API client and
 *  the SSE stream land in Steps 3.1/3.2, and each slot renders nothing rather than a placeholder
 *  that would read as real data.
 */
export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BrowserRouter>
    </ThemeProvider>
  )
}
