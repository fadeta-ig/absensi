# App Router

## Overview

This area owns the Next.js pages, layouts, route handlers, and the four protected portals. HR uses `/dashboard`, General Affairs uses `/ga`, cleaning workers use `/cleaning`, and employee self service uses `/employee`.

## Key files

* `layout.tsx` owns the document shell, theme provider, and global interface providers.
* `page.tsx` owns the root login entry.
* `dashboard/layout.tsx`, `ga/layout.tsx`, `cleaning/layout.tsx`, and `employee/layout.tsx` own portal navigation and client side session checks.
* `../proxy.ts` owns the Edge route guard before protected pages render.
* `api/` owns server route handlers and has more specific guidance in `api/AGENTS.md`.

## Conventions

* Follow App Router names such as `page.tsx`, `layout.tsx`, `loading.tsx`, and `route.ts`.
* Add `"use client"` only when a component needs browser state, effects, navigation hooks, maps, camera access, or other client APIs.
* Reuse `@/components/layout/AppShell` for protected portal shells.
* Authorize with permission codes such as `hr.manage`, `ga.manage`, `cleaning.execute`, `user.manage`, and `employee.self`.
* Keep portal redirects consistent with `src/proxy.ts` and the matching portal layout.
* Use CSS tokens from `globals.css` and preserve the light theme default with stored user preference.

## Gotchas

* Next.js 16 discovers the route guard as `src/proxy.ts`. Do not rename it to `middleware.ts`.
* Page guards improve navigation, but API routes must still enforce authorization independently.
* Employee pages are mobile focused. Preserve safe area spacing and the narrow content width unless the feature already uses a wider layout.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
