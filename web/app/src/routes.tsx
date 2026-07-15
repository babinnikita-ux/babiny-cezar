import {
  BotIcon,
  CircleDotIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  InboxIcon,
  PaletteIcon,
  SettingsIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'

import { GithubIcon } from './components/icons'
import { CompareLoading } from './routes/compare-loading'
import { NewTaskRoute } from './routes/new-task'
import { NotFoundRoute } from './routes/not-found'
import { Placeholder } from './routes/placeholder'
import { GitTabLoading } from './routes/task-git/git-tab-loading'
import { ThreadLoading } from './routes/task-thread/thread-loading'
import { TasksOverviewRoute } from './routes/tasks-overview'

/** Lazy ON PURPOSE: the thread view carries the markdown stack (Streamdown + remark/rehype,
 *  ~140 KB gz) — as a static import it would sit in the main bundle every visitor pays for
 *  before any route renders. The Suspense fallback is the same loading state the route itself
 *  shows while fetching, so the split is invisible to the user. */
const TaskThreadRoute = lazy(() =>
  import('./routes/task-thread/task-thread').then((m) => ({ default: m.TaskThreadRoute })),
)

/** Lazy for the same reason: the compare view renders Progress excerpts through Streamdown and
 *  full diffs through the Shiki singleton — thread-chunk weight the home screen must not pay. */
const CompareVariantsRoute = lazy(() =>
  import('./routes/compare-variants').then((m) => ({ default: m.CompareVariantsRoute })),
)

/** Lazy because both tabs render the shared run header, which lives in the thread chunk
 *  (markdown stack and all) — a static import here would pull that into the main bundle. */
const TaskChangesRoute = lazy(() =>
  import('./routes/task-git/task-changes').then((m) => ({ default: m.TaskChangesRoute })),
)
const TaskFilesRoute = lazy(() =>
  import('./routes/task-git/task-files').then((m) => ({ default: m.TaskFilesRoute })),
)

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

      <Route
        path="/tasks/:id"
        element={
          <Suspense fallback={<ThreadLoading />}>
            <TaskThreadRoute />
          </Suspense>
        }
      />
      <Route
        path="/tasks/:id/changes"
        element={
          <Suspense fallback={<GitTabLoading tab="changes" />}>
            <TaskChangesRoute />
          </Suspense>
        }
      />
      <Route
        path="/tasks/:id/files"
        element={
          <Suspense fallback={<GitTabLoading tab="files" />}>
            <TaskFilesRoute />
          </Suspense>
        }
      />
      <Route
        path="/compare/:groupId"
        element={
          <Suspense fallback={<CompareLoading />}>
            <CompareVariantsRoute />
          </Suspense>
        }
      />

      <Route path="/git" element={<Placeholder route="git" title="Git" icon={<GitBranchIcon />} />} />
      <Route path="/github" element={<Placeholder route="github" title="GitHub" icon={<GithubIcon />} />} />
      <Route path="/github/issues/:n" element={<Placeholder route="github-issue" title="Issue" icon={<CircleDotIcon />} />} />
      <Route path="/github/prs/:n" element={<Placeholder route="github-pr" title="Pull request" icon={<GitPullRequestIcon />} />} />

      <Route path="/inbox" element={<Placeholder route="inbox" title="Inbox" icon={<InboxIcon />} />} />
      <Route path="/workflows" element={<Placeholder route="workflows" title="Workflows" icon={<WorkflowIcon />} />} />
      <Route path="/workflows/:name" element={<Placeholder route="workflow" title="Workflow" icon={<WorkflowIcon />} />} />

      <Route path="/settings" element={<Placeholder route="settings" title="Settings" icon={<SettingsIcon />} />} />
      <Route path="/settings/skills" element={<Placeholder route="settings-skills" title="Skills" icon={<SparklesIcon />} />} />
      <Route path="/settings/appearance" element={<Placeholder route="settings-appearance" title="Appearance" icon={<PaletteIcon />} />} />
      <Route path="/settings/agents" element={<Placeholder route="settings-agents" title="Agents" icon={<BotIcon />} />} />

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  )
}
