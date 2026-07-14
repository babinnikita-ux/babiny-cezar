import { BrowserRouter } from 'react-router'
import { ThemeProvider } from './components/theme-provider'
import { AppRoutes } from './routes'

/** Real URLs, no basename: the cockpit is always mounted at the origin root, and the server
 *  serves index.html for every non-/api GET (src/server/static-ui.ts), so a deep link like
 *  `/tasks/:id/changes` cold-loads and survives a refresh.
 *
 *  The shell chrome (sidebar, 100dvh grid) lands in Step 2.3 and will wrap <AppRoutes /> here.
 */
export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  )
}
