# Shared React components

## Overview

This area owns reusable interface primitives, portal shell pieces, forms, feedback, navigation, and domain display components. Feature pages should compose these components before creating another local pattern.

## Key files

* `layout/AppShell.tsx` owns the shared protected portal shell.
* `ui/table.tsx` owns the shared table primitives.
* `ui/DataTablePagination.tsx` and `../hooks/useTablePagination.ts` own table navigation and stored page preferences.
* `ui/BulkActionBar.tsx` owns bulk selection feedback and actions.
* `ConfirmModal.tsx`, `Toast.tsx`, and `ui/FeedbackMessage.tsx` own common user feedback patterns.
* `ThemeProvider.tsx` and `ThemeToggle.tsx` own theme behavior.

## Conventions

* Name React component files and exported components with PascalCase.
* Reuse the shared table primitives instead of raw table markup in new feature pages.
* Use CSS variables and Tailwind tokens from `src/app/globals.css`. Avoid hard coded color values when a token exists.
* Use `useTablePagination` for page, limit, URL, local storage, and session storage behavior.
* Bulk actions must show eligible counts, block duplicate submission, ask for confirmation, and keep failed rows selected for retry.
* Keep interactive components accessible with clear labels, keyboard behavior, loading states, and disabled states.

## Gotchas

* The default theme is light and system theme following is disabled. User choice is restored by `next-themes`.
* Employee portal components must remain usable on narrow screens and within mobile safe areas.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
