<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# CONSUL — AI Agent Rules

> **These rules are NON-NEGOTIABLE.** Every AI agent working on this codebase must follow them without exception. Code that violates these rules will be rejected. Do not deviate, improvise, or substitute with patterns from your training data.

---

## 0. Mandatory Pre-Read: Skills

**Before writing ANY code**, you MUST read the relevant skill files. This is the first step in every task — no exceptions. Agents that skip skill reading produce inconsistent, hallucinated, low-quality code.

**Skills Directory:** `C:\Users\nural\.agents\skills\`

| Skill Directory                     | When to Read                                                       |
| ----------------------------------- | ------------------------------------------------------------------ |
| `find-skills/`                      | Not sure which skill applies? **Start here.**                      |
| `next-best-practices/`              | Pages, layouts, route handlers, middleware, RSC, App Router         |
| `postgres-pro/`                     | Raw SQL queries, complex database operations                       |
| `supabase-postgres-best-practices/` | Supabase-specific Postgres patterns, RLS, storage                  |
| `typescript-pro/`                   | TypeScript patterns, type inference, generics, utility types        |
| `ui-ux-pro-max/`                    | UI components, design system, interaction patterns                 |
| `vercel-react-best-practices/`      | React patterns, hooks, state management, Vercel deployment          |
| `prompt-engineer/`                  | AI prompts, system instructions, structured output                 |
| `token-efficiency/`                 | Token usage optimization, reducing AI costs                        |
| `api-design-principles/`            | REST/API endpoint design, request/response schemas                 |
| `api-designer/`                     | API architecture and endpoint design patterns                      |
| `brandkit/`                         | Brand identity, colors, typography, logo usage                     |
| `design-taste-frontend/`            | Frontend design taste and aesthetic judgment (latest)               |
| `design-taste-frontend-v1/`         | Frontend design taste v1 (legacy reference)                        |
| `high-end-visual-design/`           | Premium visual design patterns and execution                       |
| `industrial-brutalist-ui/`          | Industrial/brutalist UI aesthetic reference                        |
| `minimalist-ui/`                    | Minimalist UI patterns and restraint-driven design                 |
| `shadcn/`                           | shadcn/ui component patterns and customization                     |
| `stitch-design-taste/`              | Design taste for stitching/combining UI elements                   |
| `image-to-code/`                    | Converting design images to code implementation                    |
| `imagegen-frontend-mobile/`         | Mobile frontend image generation patterns                          |
| `imagegen-frontend-web/`            | Web frontend image generation patterns                             |
| `redesign-existing-projects/`       | Patterns for redesigning existing UI/UX                            |
| `full-output-enforcement/`          | Ensuring complete output without truncation                        |
| `gpt-taste/`                        | GPT-specific taste and style guidance                              |

**How to use:** Read the `SKILL.md` file inside the relevant directory before starting work.

```
Example workflow:
1. Task: "Build a new settings page"
2. Read: next-best-practices/SKILL.md  → page/layout patterns
3. Read: ui-ux-pro-max/SKILL.md        → component design
4. Read: typescript-pro/SKILL.md       → type patterns
5. Read: high-end-visual-design/SKILL.md → visual quality
6. Then start coding
```

**Mapping by task type:**
- Working on API routes or pages? → `next-best-practices/SKILL.md`
- Working on database queries? → `postgres-pro/SKILL.md` + `supabase-postgres-best-practices/SKILL.md`
- Building UI components? → `ui-ux-pro-max/SKILL.md` + `high-end-visual-design/SKILL.md`
- Writing TypeScript? → `typescript-pro/SKILL.md`
- Designing API endpoints? → `api-design-principles/SKILL.md` + `api-designer/SKILL.md`
- Redesigning or refactoring UI? → `redesign-existing-projects/SKILL.md`
- Working on brand/visual identity? → `brandkit/SKILL.md` + `minimalist-ui/SKILL.md`

---

## 1. Product Context

**CONSUL** is an AI-powered platform for healthcare professionals. It provides deterministic clinical pathway summarization and patient history validation. The product targets hospitals, clinics, and healthcare institutions that need standardized, auditable clinical workflows.

### Tech Stack
- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Database:** PostgreSQL (Supabase-hosted) via Prisma ORM v7
- **Auth:** Custom JWT-based authentication (bcryptjs + jose). No third-party auth providers
- **AI Gateway:** Provider-configurable AI gateway via Vercel AI SDK-compatible driver
- **Workflow:** Background workflow runner for claim validation steps
- **Validation:** Zod v4 for runtime schema validation
- **UI Primitives:** Radix UI + Lucide React icons + class-variance-authority
- **Fonts:** Geist Sans & Geist Mono (via `next/font/google`)

### Project Structure
```
src/
├── app/
│   ├── (auth)/                        # Auth route group (login, register)
│   ├── api/
│   │   ├── auth/                      # Auth API routes (login, register, logout)
│   │   └── v1/                        # Versioned REST API
│   │       ├── claims/                # Claim validation endpoints
│   │       ├── documents/             # Document management
│   │       ├── drugs/                 # Drug database endpoints
│   │       ├── jobs/                  # Background job management
│   │       ├── pathways/              # Clinical pathway endpoints
│   │       ├── providers/             # Healthcare provider endpoints
│   │       └── tariff/                # Tariff/billing endpoints
│   ├── dashboard/
│   │   ├── clinical-pathway/          # Clinical pathway workspace
│   │   │   ├── [jobId]/               # Individual job detail
│   │   │   ├── baru/                  # New pathway creation
│   │   │   ├── components/            # Pathway-specific components
│   │   │   └── scenario-json/         # JSON scenario viewer
│   │   ├── master-data/               # Master data management
│   │   └── settings/                  # User & org settings
│   ├── compliance/                    # Compliance pages
│   ├── docs/ & documentation/         # Documentation pages
│   ├── api-docs/                      # API reference (Scalar)
│   ├── privacy/                       # Privacy policy
│   ├── terms/                         # Terms of service
│   ├── globals.css                    # Global styles & Tailwind config
│   ├── layout.tsx                     # Root layout
│   └── page.tsx                       # Landing page
├── components/
│   ├── dashboard/
│   │   └── DashboardShell.tsx         # Main dashboard shell/layout
│   ├── landing/                       # Landing page sections
│   │   ├── AIArchitecture.tsx
│   │   ├── CorePillars.tsx
│   │   ├── Footer.tsx
│   │   ├── Hero.tsx
│   │   ├── Navbar.tsx
│   │   ├── ProblemMatrix.tsx
│   │   ├── UseCases.tsx
│   │   └── WorkflowDiagram.tsx
│   ├── providers/                     # React context providers
│   ├── ui/                            # Shared UI primitives
│   │   ├── button.tsx
│   │   ├── DataTableControls.tsx
│   │   └── GlobalOverlay.tsx
│   └── PasswordInput.tsx              # Password input component
├── lib/
│   ├── ai/gateway.ts                  # AI service gateway
│   ├── middleware/                     # Route middleware utilities
│   ├── api-key.ts                     # API key management
│   ├── auth.ts                        # JWT & password hashing
│   ├── claim-display.ts               # Claim display formatting
│   ├── claim-documents.ts             # Claim document handling
│   ├── credits.ts                     # Credit system logic
│   ├── db.ts                          # Prisma client singleton
│   ├── los.ts                         # Length-of-Stay calculations
│   ├── rate-limit.ts                  # Rate limiting utilities
│   ├── rbac.ts                        # Role-based access control
│   ├── supabase-storage.ts            # Supabase storage client
│   └── utils.ts                       # General utilities (cn, etc.)
├── workflows/
│   └── claim-validation/              # Claim validation workflow steps
├── generated/prisma/                  # Auto-generated Prisma client
└── proxy.ts                           # Proxy utilities
prisma/
├── schema.prisma                      # Database schema
├── migrations/                        # Migration files
├── seed-kfa-drugs.ts                  # KFA drug database seed
├── seed-mitra-keluarga.ts             # Mitra Keluarga seed data
└── seed-pii.ts                        # PII test data seed
prisma.config.ts                       # Prisma 7 config (datasource URL)
docs/
└── clinical-pathway-data-contract.md  # Canonical data contract
```

---

## 2. Clinical Pathway Data Contract

**BEFORE** changing any of the following, read `docs/clinical-pathway-data-contract.md` **completely**:

- Clinical Pathway logic or UI
- Claim Validation workflows
- Fees & Drugs calculations
- Scoring algorithms
- AI Usage Logs
- API documentation
- API key management
- Validators and Zod schemas
- Workflow aggregation
- Result UI components

**Rules:**
- Do not rename or repurpose data contract keys without updating **every** producer/consumer listed in the contract document
- The data contract file is the **single source of truth** for field names, fallback keys, scoring rules, LOS behavior, and timeline grouping
- Any change to the contract must include a checklist update in the contract file itself

---

## 3. Design Language & Visual Standards

CONSUL uses an **ultra-minimalist, medical-professional grade** design language. Every pixel must convey trust, precision, and clinical authority.

### Color Palette
- **Primary tones:** Neutral slate and zinc (`slate-50` through `slate-950`, `zinc-50` through `zinc-950`)
- **Accent usage:** Minimal, deliberate accent colors only for actionable elements and status indicators
- **Status colors:** Semantic and muted — avoid saturated raw colors. Use tailored HSL tones
- **Backgrounds:** Clean whites and near-whites for light mode; deep slates for dark mode
- **Forbidden:** Neon colors, heavily saturated primaries, rainbow gradients, bright candy colors

### Typography
- **Font family:** Geist Sans (primary), Geist Mono (code/data)
- **Hierarchy:** Clear and consistent — use font-weight and size to establish hierarchy, not color
- **Data-heavy screens:** Use tabular/monospace numbers for alignment in tables and metrics

### Spacing & Layout
- **Consistent spacing scale:** Follow Tailwind's spacing scale. Do not use arbitrary values unless absolutely necessary
- **Content width:** Max-width containers for readability. Never let content stretch full-width on large screens
- **Density:** Medical dashboards need information density — avoid excessive whitespace between data points

### Iconography
- **Icon library:** Lucide React exclusively. Do not introduce other icon libraries
- **Icon sizing:** Consistent sizes within context (16px inline, 20px in buttons, 24px in navigation)
- **Icon style:** Stroke-based, 1.5-2px stroke width. Never use filled/solid icons unless explicitly needed for active states

---

## 4. Anti-AI-Slop Policy

> **This is critical.** AI-generated UI has recognizable patterns that look generic, templated, and untrustworthy. CONSUL must NOT look like AI-generated slop. The following patterns are **BANNED**.

### Banned Visual Patterns

| #  | Banned Pattern | Why It's Banned | What to Do Instead |
|----|----------------|-----------------|---------------------|
| 1  | Oversized `rounded-2xl`, `rounded-3xl`, `rounded-[20px]+` on cards/containers | Screams "AI template". Looks childish for a medical platform | Use `rounded-lg` (8px) as standard card radius. Exception: bottom sheet top corners only may use `rounded-t-[20px]` |
| 2  | Emoji characters anywhere in the UI | Unprofessional for medical software. No emoji in headings, buttons, status indicators, or empty states | Use Lucide icons for all visual indicators |
| 3  | Gradient text (`bg-clip-text text-transparent bg-gradient-to-r`) | Generic SaaS aesthetic. Only acceptable on a single hero tagline if explicitly designed | Use solid colors for text. Differentiate via font-weight and size |
| 4  | Generic hero: centered text + oversized heading + vague subtitle + two CTA buttons | The #1 "AI-made landing page" signal | Make heroes information-dense and product-specific. Show real data, workflows, or product screenshots |
| 5  | Identical repeating card grids (icon + title + description × 3-4) | The most common AI slop pattern | Use asymmetric grids, data tables, comparison matrices, or narrative sections |
| 6  | `backdrop-blur` + semi-transparent backgrounds as default card style | Excessive glassmorphism is distracting | Reserve glassmorphism for overlays and modals only |
| 7  | Rainbow/multi-color accent schemes | Clashes with medical-professional design language | Monochromatic slate/zinc palette. ONE accent color maximum |
| 8  | `shadow-xl`, `shadow-2xl` on cards | Floating card effect looks generic | Use `shadow-sm` maximum. Prefer `border border-slate-200` for card separation |
| 9  | Decorative gradient blobs/circles in backgrounds | Pure AI decoration noise | Clean backgrounds. No decorative SVG shapes behind content |
| 10 | "Testimonial" or "trusted by" sections with placeholder logos | Fake trust signals | Only add if real data exists. Every section must show functional content |
| 11 | `animate-pulse`, `animate-bounce`, `animate-spin` on non-loading elements | Distracting, unprofessional | Use `transition-colors duration-150` for hover states. `animate-pulse` on skeleton placeholders only |
| 12 | Oversized SVG illustrations in empty states | Generic, adds no value | Text-only empty states with clear action: "Belum ada data. [Buat Baru]" |

### Standard Patterns (Use These)

```
Cards:        rounded-lg border border-slate-200 bg-white p-4
Shadows:      shadow-sm maximum. Prefer borders
Status:       Small colored dots (8px) or subtle background tints on rows/badges
Empty:        Simple text + action button. "Belum ada data. [Buat Baru]"
Features:     Data tables, before/after comparisons, workflow diagrams
Hover:        transition-colors duration-150
Show/Hide:    transition-opacity duration-200
```

---

## 5. Responsive & Mobile-First Design

**All code must be written mobile-first.** Start with the smallest breakpoint and scale up. This is non-negotiable.

### Breakpoint Strategy

```
Default (mobile)  → sm: (640px)  → md: (768px)  → lg: (1024px)  → xl: (1280px)  → 2xl: (1536px)
Write base styles    Scale up        Scale up        Scale up         Scale up          Scale up
```

### Mobile Requirements (< 1024px / `lg:hidden`)

**Fixed Bottom Navigation Bar:**
- Maximum 5 navigation slots
- Center slot: Primary FAB (Floating Action Button) that triggers a bottom sheet menu
- Position: `fixed bottom-0 left-0 right-0` with appropriate `z-index`
- Add `pb-safe` or equivalent bottom padding for iOS safe area

**Bottom Sheet Menus:**
- Float above the bottom navigation bar
- Top corners: `rounded-t-[20px]` (the ONLY exception to the rounded-2xl+ ban)
- Backdrop: `backdrop-blur-sm` with semi-transparent overlay
- Grid layout: `grid grid-cols-4 gap-4` for navigation menus
- Smooth open/close transitions with `transform` and `opacity`

**Form Accessibility:**
- All `<input>` and `<select>` elements: `text-base` minimum on mobile (prevents iOS Safari auto-zoom)
- Scale down on desktop: `sm:text-sm`
- Touch targets: Minimum 44×44px tap area on all interactive elements
- Adequate spacing between form fields for thumb navigation

**Content Layout:**
- Single column layout on mobile
- Full-width cards with horizontal padding (`px-4`)
- Collapsible/accordion patterns for dense information
- Horizontal scrolling tables with sticky first column when necessary

### Desktop Requirements (>= 1024px / `lg:block`)

- Sidebar navigation instead of bottom bar
- Multi-column layouts where information density benefits
- Hover states on all interactive elements
- Data tables with visible columns (no horizontal scroll unless 6+ columns)

### Responsive Testing Checklist

Every new page/component MUST be verified at these widths:

| Width   | Device                                    |
| ------- | ----------------------------------------- |
| 375px   | iPhone SE / small mobile                  |
| 390px   | iPhone 14 / standard mobile               |
| 768px   | iPad / tablet                             |
| 1024px  | Small desktop / breakpoint transition      |
| 1440px  | Standard desktop                          |

---

## 6. Authentication & Security

1. **No third-party auth.** All authentication is custom-built. Do NOT introduce NextAuth, Auth.js, Supabase Auth, Clerk, or any external auth provider. **Instant rejection.**
2. **Password hashing:** Always use `bcryptjs`. Never store or log plain-text passwords. No exceptions.
3. **Sessions:** Signed JWTs stored in HTTP-only cookies. Utilities in `src/lib/auth.ts`.
4. **API security:** All API endpoints must validate authentication and authorization. Use middleware in `src/lib/middleware/`.
5. **API keys:** Use utilities in `src/lib/api-key.ts` for API key management.
6. **Rate limiting:** Apply via `src/lib/rate-limit.ts` on all public-facing endpoints.
7. **RBAC:** Role-based access control via `src/lib/rbac.ts`. Check permissions before data access.

---

## 7. Database & ORM

1. **Prisma 7 breaking change:** `url` and `directUrl` are configured in `prisma.config.ts`, NOT in `schema.prisma`. The schema only declares `provider`.
2. **Prisma client:** Use the singleton from `src/lib/db.ts`. Do NOT create new `PrismaClient` instances.
3. **Generated client:** Located in `src/generated/prisma/`. Never manually edit generated files.
4. **Migrations:** `npx prisma migrate dev` for development, `npx prisma migrate deploy` for production.
5. **Schema changes:** After modifying `prisma/schema.prisma`, always run `npx prisma generate` to regenerate the client.

---

## 8. Code Quality & TypeScript Discipline

### Strict TypeScript Rules

- **No `any` type.** Ever. Use `unknown` if the type is truly unknown, then narrow it with type guards.
- **No `@ts-ignore` or `@ts-expect-error`** unless accompanied by a comment explaining why and a linked issue/TODO for resolution.
- **Explicit return types** on all exported functions and API route handlers.
- **Interface over type** for object shapes that may be extended.
- **Zod schemas** for all runtime validation (API inputs, form data, external API responses).

### File Organization

- One component per file. File name matches the component name.
- Co-locate component-specific types in the same file.
- Shared types go in `src/types/` or alongside the module they describe.
- No barrel exports (`index.ts` re-exporting everything) — use direct imports.

### Import Order

```typescript
// 1. React/Next.js imports
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 2. Third-party libraries
import { z } from 'zod'

// 3. Internal modules (absolute paths with @/)
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// 4. Relative imports (co-located files)
import { columns } from './columns'
```

### Naming Conventions

| Item               | Convention                   | Example                              |
| ------------------ | ---------------------------- | ------------------------------------ |
| Components         | PascalCase                   | `DashboardShell.tsx`                 |
| Hooks              | camelCase with `use` prefix  | `useAuth.ts`                         |
| Utilities          | camelCase                    | `formatCurrency.ts`                  |
| Constants          | SCREAMING_SNAKE_CASE         | `MAX_RETRY_COUNT`                    |
| Types/Interfaces   | PascalCase                   | `ClaimValidationResult`              |
| API route files    | `route.ts`                   | `src/app/api/v1/claims/route.ts`     |
| CSS variables      | kebab-case with `--` prefix  | `--color-primary`                    |

### Component Architecture

**Server vs Client Components:**
- Default to Server Components. Only add `'use client'` when the component needs browser APIs, event handlers, or React hooks.
- Push `'use client'` as deep as possible. If only a button needs interactivity, extract it as a client component — don't make the entire page a client component.
- Never fetch data in client components if it can be done in a server component and passed as props.

**Component Composition:**
- Prop drilling limit: 2 levels. Beyond that, use React Context or restructure.
- No God components. If a file exceeds 300 lines, decompose it.
- Separate concerns: Data fetching (server) → Layout (server) → Interactivity (client).

**Next.js 16 Warning:**
> This project uses Next.js 16 which has breaking changes from versions in your training data. Before writing any page, layout, route handler, or middleware:
> 1. Read the relevant guide in `node_modules/next/dist/docs/`
> 2. Check for deprecated APIs
> 3. Follow the documented patterns, NOT your training data

---

## 9. Language & Localization

- **UI copy:** All user-facing text MUST be in **Bahasa Indonesia**
- **Code:** Comments, variable names, function names, and documentation in **English**
- **Error messages:** User-facing errors in Bahasa Indonesia; system/developer logs in English
- **Date formatting:** `dd/MM/yyyy` for display, ISO 8601 for storage and APIs
- **Currency:** Indonesian Rupiah (Rp) with period thousand-separators (e.g., `Rp 1.250.000`)

---

## 10. Shell & OS Environment

- **OS:** Windows
- **Shell:** PowerShell
- **Command chaining:** Use `;` instead of `&&` to chain terminal commands
- **Path separators:** Use forward slashes `/` in code and imports. PowerShell handles both
- **Line endings:** LF (Unix-style). Configure git: `git config core.autocrlf input`

---

## 11. Auto-Verification Gate

> **Every execution session MUST end with TypeScript verification.** This is not optional. This is the final gate before any task can be reported as complete.

### The Command

```powershell
npx tsc --noEmit
```

### Verification Rules

1. **Run `npx tsc --noEmit` after every code change session.** Not just at the end of the full task — after each logical batch of changes.
2. **If TypeScript errors are found:** Fix ALL errors before reporting the task as complete. Do not leave type errors for the user to fix.
3. **If errors cannot be resolved:** Document each error with file path, line number, and explanation of why it cannot be fixed. Propose a solution.
4. **Zero-error policy:** The command must exit with code 0 before any task is considered done.
5. **Do NOT suppress errors** by adding `any` types, `@ts-ignore`, or loosening `tsconfig.json` strictness.

### Verification Workflow

```
1. Make code changes
2. Run: npx tsc --noEmit
3. If errors → fix them → go to step 2
4. If clean (exit code 0) → report task complete
```

### What Counts as a "Session"

A session is any continuous block of work that produces code changes. Examples:
- Building a new page or component
- Fixing a bug
- Refactoring existing code
- Adding a new API endpoint
- Modifying database schema and related code

Each of these MUST end with a clean `npx tsc --noEmit` run.
