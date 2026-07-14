import { SquarePenIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Placeholder } from './placeholder'
import { parseNewTaskParams } from './new-task-params'

/** `/new` — the bookmarklet deep-link target (spec 011).
 *
 *  This Step only proves the params survive the move off the legacy page: they
 *  are parsed and echoed. Auto-start (`auto=1` + launch key) is Step R4's job,
 *  together with the real composer; until then the legacy page still honors it
 *  at `/new?legacy=1`.
 */
export function NewTaskRoute() {
  const [search] = useSearchParams()
  const params = parseNewTaskParams(search)

  return (
    <Placeholder route="new" title="New task" icon={<SquarePenIcon />}>
      <dl data-testid="new-task-params" className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-left text-sm">
        {([
          ['skill', params.skill],
          ['ref', params.ref],
          ['auto', String(params.auto)],
          // The launch key is a secret (spec 011) — the composer gets the value,
          // the page only admits whether one arrived.
          ['key', params.key ? 'present' : ''],
        ] as const).map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="font-mono text-xs text-muted-foreground">{name}</dt>
            <dd data-testid={`new-task-param-${name}`} className="font-mono text-xs text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Placeholder>
  )
}
