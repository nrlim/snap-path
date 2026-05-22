<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SnapPath — Project Context

## Product Overview
SnapPath is an AI-powered platform for healthcare professionals. It provides deterministic clinical pathway summarization and patient history validation. The product targets hospitals, clinics, and healthcare institutions that need standardized, auditable clinical workflows.

## Tech Stack
- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Database:** PostgreSQL (Supabase-hosted) via Prisma ORM v7
- **Auth:** Custom JWT-based authentication (bcryptjs + jose). No third-party auth providers
- **AI Gateway:** Upstash Workflow (`@upstash/workflow`)
- **Fonts:** Geist Sans & Geist Mono (via `next/font/google`)

## Project Structure
```
src/
├── app/
│   ├── (auth)/           # Auth route group (login, register)
│   ├── api/auth/         # Custom auth API routes (login, register, logout)
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing page
│   └── globals.css
├── components/
│   └── landing/          # Landing page components (Navbar, Hero, etc.)
├── lib/
│   ├── ai/gateway.ts     # AI service gateway
│   ├── auth.ts           # JWT & password hashing utilities
│   └── db.ts             # Prisma client singleton
└── generated/prisma/     # Auto-generated Prisma client
prisma/
├── schema.prisma         # Database schema (User model)
prisma.config.ts          # Prisma 7 config (datasource URL lives here, not in schema)
```

## Critical Rules
1. **Prisma 7 breaking change:** `url` and `directUrl` are configured in `prisma.config.ts`, NOT in `schema.prisma`. The schema only declares `provider`.
2. **No third-party auth.** All authentication is custom-built. Do not introduce NextAuth, Auth.js, Supabase Auth, Clerk, or any external auth provider.
3. **Password security.** Passwords must always be hashed with bcryptjs before storage. Never store or log plain-text passwords.
4. **Session management.** Sessions use signed JWTs stored in HTTP-only cookies. The utilities live in `src/lib/auth.ts`.
5. **Design language.** Ultra-minimalist, medical-professional grade. Neutral slate/zinc tones. No emojis in UI. No heavy shadows or neon colors.
6. **Language.** UI copy is in Bahasa Indonesia. Code comments and variable names are in English.
7. **PowerShell shell.** This project runs on Windows. Use `;` instead of `&&` to chain terminal commands.
8. **Mobile-first priority.** Always prioritize mobile-first resolution and responsive design when creating new features or pages.
   - **Native App Feel:** On mobile screens (`lg:hidden`), use a **Fixed Bottom Navigation Bar** with up to 5 slots. The center slot should typically be a primary FAB (Floating Action Button) that triggers a bottom sheet menu.
   - **Bottom Sheet Grid Menus:** Mobile popup menus should appear as bottom sheets floating above the navigation, featuring smooth rounded corners (e.g., `rounded-[24px]`) and a blurred backdrop (`backdrop-blur-sm`). Use **Grid layouts** (`grid-cols-4`) for navigation menus to emulate native app drawers.
   - **Form Accessibility:** All inputs and selects must have a minimum font size of `text-base` on mobile to prevent iOS Safari auto-zoom, scaling to `sm:text-sm` for desktop layouts.

## Skills Reference
Before writing code, check for relevant skill files in the skills directory:

```
C:\Users\nural\.agents\skills\
├── find-skills/                    # How to discover and use skills
├── next-best-practices/            # Next.js patterns, route handlers, RSC, etc.
├── postgres-pro/                   # PostgreSQL query patterns
├── supabase-postgres-best-practices/ # Supabase-specific Postgres guidance
├── typescript-pro/                 # TypeScript patterns and best practices
├── ui-ux-pro-max/                  # UI/UX design system and component patterns
├── vercel-react-best-practices/    # React and Vercel deployment patterns
├── prompt-engineer/                # Prompt engineering techniques
└── token-efficiency/               # Token usage optimization
```

**Usage:** Read the `SKILL.md` file inside the relevant skill directory before starting work on a related task. For example:
- Working on API routes or pages? Read `next-best-practices/SKILL.md`
- Working on database queries? Read `postgres-pro/SKILL.md` and `supabase-postgres-best-practices/SKILL.md`
- Building UI components? Read `ui-ux-pro-max/SKILL.md`
- Writing TypeScript? Read `typescript-pro/SKILL.md`
- Not sure which skill applies? Read `find-skills/SKILL.md`
