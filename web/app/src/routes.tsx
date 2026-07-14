import { Route, Routes } from 'react-router'
import { NewTaskRoute } from './routes/new-task'
import { Placeholder } from './routes/placeholder'
import { TasksOverviewRoute } from './routes/tasks-overview'

/** The route map from the spec's "Routing — every surface is a URL" section.
 *
 *  Real URLs, not hash routes: the Hono server serves the built index.html for
 *  every non-/api GET (src/server/static-ui.ts `resolveGetRequest`), so each of
 *  these cold-loads and survives a refresh.
 *
 *  `/` is the real Tasks overview (Step 3.4); the remaining elements are
 *  placeholders until their views land in R3–R6. Keep the paths stable: they
 *  are what teammates paste.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TasksOverviewRoute />} />
      <Route path="/new" element={<NewTaskRoute />} />

      <Route path="/tasks/:id" element={<Placeholder route="task-thread" title="Thread" />} />
      <Route path="/tasks/:id/changes" element={<Placeholder route="task-changes" title="Changes" />} />
      <Route path="/tasks/:id/files" element={<Placeholder route="task-files" title="Files" />} />
      <Route path="/compare/:groupId" element={<Placeholder route="compare" title="Compare variants" />} />

      <Route path="/git" element={<Placeholder route="git" title="Git" />} />
      <Route path="/github" element={<Placeholder route="github" title="GitHub" />} />
      <Route path="/github/issues/:n" element={<Placeholder route="github-issue" title="Issue" />} />
      <Route path="/github/prs/:n" element={<Placeholder route="github-pr" title="Pull request" />} />

      <Route path="/inbox" element={<Placeholder route="inbox" title="Inbox" />} />
      <Route path="/workflows" element={<Placeholder route="workflows" title="Workflows" />} />
      <Route path="/workflows/:name" element={<Placeholder route="workflow" title="Workflow" />} />

      <Route path="/settings" element={<Placeholder route="settings" title="Settings" />} />
      <Route path="/settings/skills" element={<Placeholder route="settings-skills" title="Skills" />} />
      <Route path="/settings/appearance" element={<Placeholder route="settings-appearance" title="Appearance" />} />
      <Route path="/settings/agents" element={<Placeholder route="settings-agents" title="Agents" />} />

      {/* Step 4.1 replaces this with the CenteredState 404 + "Back to tasks". */}
      <Route path="*" element={<Placeholder route="not-found" title="Page not found" />} />
    </Routes>
  )
}
