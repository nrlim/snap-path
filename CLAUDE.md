# SnapPath — Claude Code Instructions

Read and follow everything in @AGENTS.md. That file is the single source of truth for project context, tech stack, structure, critical rules, and skills references.

## Additional Claude-Specific Guidance

### Before Writing Code
1. Check `C:\Users\nural\.agents\skills\find-skills\SKILL.md` if unsure which skill applies to the current task.
2. Read the relevant `SKILL.md` from `C:\Users\nural\.agents\skills\` for the domain you are working in.
3. For Next.js work, always consult `node_modules/next/dist/docs/` for API changes specific to this version.

### Code Style
- Keep functions small and focused.
- Prefer named exports for components. Use default exports only for page/layout files (Next.js convention).
- Use `@/` path aliases for imports from `src/`.
- All database access goes through the Prisma singleton in `src/lib/db.ts`.

### Commit Discipline
- Write clear, descriptive commit messages in English.
- Group related changes into a single commit.
