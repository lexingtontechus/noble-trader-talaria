# .github/workflows — release template

Skeleton placeholder. On first release, add a workflow that:

1. Triggers on tag push (`v*`) or manual `workflow_dispatch`
2. Runs verification: `node --check` + render harness + `cmp` byte-check +
   `py_compile` on talaria-tools + scripts
3. Builds the release asset: a tarball/zip of `plugins/` + `scripts/` +
   `supabase/migrations/` + `docs/`
4. Drafts the GitHub Release with the Install section from README.md

(Fill in concrete steps during the first release.)
