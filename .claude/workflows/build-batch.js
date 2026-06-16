export const meta = {
  name: 'build-batch',
  description: 'Build a batch of safe-parallel roadmap items, each in its own worktree → tests → draft PR',
  whenToUse: 'After Augusto approves a batch of roadmap item IDs. Pass the items as args.',
  phases: [
    { title: 'Build', detail: 'one isolated sub-agent per item: implement + test + draft PR' },
    { title: 'Report', detail: 'consolidate PR links + device checklists' },
  ],
}

// args: array of items to build. Each item: { id, title, brief }
//   id    — roadmap ID, e.g. "P3-FEED"
//   title — short human label
//   brief — what to build (context, expected behavior, acceptance) — written at gate-1 approval time
// If args is missing/empty, the workflow refuses (a batch must be explicitly approved).

// args may arrive as an array, a JSON string, or {items:[...]} — normalize all of them.
let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (e) { parsedArgs = [] }
}
const items = Array.isArray(parsedArgs)
  ? parsedArgs
  : (parsedArgs && Array.isArray(parsedArgs.items) ? parsedArgs.items : [])

if (items.length === 0) {
  log(`No items passed (args type: ${typeof args}). Pass items as args: [{id,title,brief}, ...]`)
  return { error: 'empty-batch', argsType: typeof args }
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'branch', 'status', 'ciMobile', 'ciWeb', 'prUrl', 'deviceChecklist', 'notes'],
  properties: {
    id: { type: 'string' },
    branch: { type: 'string', description: 'fresh branch created off main, e.g. ticket/p3-feeding' },
    status: { type: 'string', enum: ['done', 'partial', 'failed'] },
    ciMobile: { type: 'string', description: 'mobile jest result summary, e.g. "270 passed"' },
    ciWeb: { type: 'string', description: 'web vitest result summary, e.g. "19 passed"' },
    prUrl: { type: 'string', description: 'draft PR URL, or "" if not opened' },
    deviceChecklist: {
      type: 'array',
      items: { type: 'string' },
      description: 'concrete on-device steps Augusto runs to verify (gate 2)',
    },
    notes: { type: 'string', description: 'judgment calls, residual risk, anything Augusto must know' },
  },
}

const ORIENT =
  'Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented. Then read docs/dev-pipeline.md ' +
  'for the conventions you MUST follow (one fresh branch off main, no fake data, scope by ' +
  'pet_id/owner_user_id, soft-delete + refetch, squash-merge default, CI green before done).'

phase('Build')

const results = await parallel(
  items.map((item) => () =>
    agent(
      [
        ORIENT,
        '',
        `TASK (roadmap item ${item.id} — ${item.title}):`,
        item.brief,
        '',
        'Build ONLY this item. Steps:',
        '1. Create a fresh branch off the latest main: `ticket/<kebab-id>`.',
        '2. Implement the change. Match surrounding code style. No fake/mock data; empty states only.',
        '3. Run mobile tests (jest) and web tests (vitest). Both must be green. If a lockfile changed,',
        '   validate with `npx npm@10 ci --dry-run` before committing it.',
        '4. Commit (clear message), push the branch, and open a DRAFT PR with `gh pr create --draft`.',
        '   PR body: what changed, the conventions honored, and a concrete on-device test checklist.',
        '5. Do NOT merge. Do NOT touch files outside this item\'s scope (other agents build in parallel).',
        '',
        'Return the structured result. If you cannot finish, set status=partial/failed and explain in notes.',
      ].join('\n'),
      {
        label: `build:${item.id}`,
        phase: 'Build',
        isolation: 'worktree',
        schema: RESULT_SCHEMA,
      }
    )
  )
)

phase('Report')

const built = results.filter(Boolean)
const ok = built.filter((r) => r.status === 'done')
const problems = built.filter((r) => r.status !== 'done')

log(`Batch built: ${ok.length}/${items.length} clean, ${problems.length} need attention.`)

return {
  summary: {
    requested: items.length,
    clean: ok.length,
    problems: problems.length,
  },
  results: built,
}
