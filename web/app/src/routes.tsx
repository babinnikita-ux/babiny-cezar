import {
  BotIcon,
  CircleDotIcon,
  FileDiffIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  InboxIcon,
  MessageSquareTextIcon,
  PaletteIcon,
  ScaleIcon,
  SettingsIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react'
import { Route, Routes } from 'react-router'

import { GithubIcon } from './components/icons'
import { NewTaskRoute } from './routes/new-task'
import { NotFoundRoute } from './routes/not-found'
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

      <Route path="/tasks/:id" element={<Placeholder route="task-thread" title="Thread" icon={<MessageSquareTextIcon />} />} />
      <Route path="/tasks/:id/changes" element={<Placeholder route="task-changes" title="Changes" icon={<FileDiffIcon />} />} />
      <Route path="/tasks/:id/files" element={<Placeholder route="task-files" title="Files" icon={<FolderTreeIcon />} />} />
      <Route path="/compare/:groupId" element={<Placeholder route="compare" title="Compare variants" icon={<ScaleIcon />} />} />

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
