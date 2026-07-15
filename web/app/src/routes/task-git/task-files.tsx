import { FolderTreeIcon } from 'lucide-react'
import { useParams } from 'react-router'

import { useRun } from '@/api/queries'
import { CenteredState } from '@/components/centered-state'

import { RunHeader } from '../task-thread/run-header'
import { GitTabLoadError, GitTabLoading } from './git-tab-loading'

/**
 * `/tasks/:id/files` — the Files tab's ROUTE landed with the Changes tab (R5 Step 1.5) so
 * the three-tab header is real and deep-linkable; the worktree browser itself (tree +
 * preview, images inline, size caps) is Step 1.6. Until then this is an honest stub under
 * the real header, not a fake browser.
 */
export function TaskFilesRoute() {
  const { id } = useParams<{ id: string }>()
  const run = useRun(id)

  if (run.isPending) return <GitTabLoading tab="files" />
  if (run.isError) return <GitTabLoadError tab="files" error={run.error} />

  return (
    <div data-route="task-files" className="flex min-h-full flex-col">
      <RunHeader run={run.data} tab="files" />
      <CenteredState
        icon={<FolderTreeIcon />}
        tone="neutral"
        heading="h2"
        title="Files"
        subtitle="The read-only worktree browser arrives in the next step of this phase."
      />
    </div>
  )
}
