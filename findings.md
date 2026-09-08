# Findings & Technical Discoveries: Employee Portal Layout Standardization

This file records technical discoveries, architecture observations, and key facts gathered during the layout standardization task.

## Key Discoveries

1. **Floating Mobile Bottom Nav Dimensions**:
   - Component: `MobileBottomNav` in `src/app/employee/layout.tsx`.
   - Dimensions: Outer container `px-4 pb-6` + `<nav>` `pb-2 pt-2` + center camera button `-top-7` (68px).
   - Total effective height: ~85px–95px.
   - Root cause of clipping: `src/components/layout/AppShell.tsx` only provided `pb-16` (64px), resulting in a negative clearance deficit of ~25px–31px.

2. **16 Employee Pages Inventory**:
   - `/employee` (Home / Dashboard) - Reference baseline with `max-w-md mx-auto pb-24`.
   - `/employee/attendance` (Selfie & GPS Attendance).
   - `/employee/attendance-history` (Daily/Monthly/Yearly Attendance History).
   - `/employee/attendance/correction` (Attendance Correction Form & Requests).
   - `/employee/visits` (Field Client Visits & Geotag Photo Check-in/out).
   - `/employee/leave` (Leave Requests & Balance).
   - `/employee/overtime` (Overtime Requests & Calculator).
   - `/employee/payslip` (Monthly Payslips & PDF Download).
   - `/employee/documents` (Physical Documents Archive).
   - `/employee/assets` (Assigned Company Assets).
   - `/employee/news` (Company Announcements & Feed).
   - `/employee/todos` (Personal Todo Checklist).
   - `/employee/profile` (Profile, Contact, & Avatar Upload).
   - `/employee/settings` (Password & App Preferences).
   - `/employee/monitoring` (Team Subordinates Attendance Monitoring).
   - `/employee/monitoring/[id]` (Subordinate Profile & Record View).

3. **7 Critical Clipping Pages Identified in Audit**:
   - `attendance-history`, `leave`, `payslip`, `news`, `todos`, `monitoring`, `monitoring/[id]`.
   - All 7 lack bottom padding (`pb-0`), causing pagination, submit buttons, and cards to be unreachable under the floating navbar on mobile.

4. **Scope Lock (HR Excluded)**:
   - User confirmed: HR Dashboard (`/dashboard/*`) is strictly desktop-oriented (dense tables up to 1200px) and will NOT be converted to a mobile canvas.
   - Focus is 100% on the 16 employee pages.

5. **Safe Approach for Reusable Container**:
   - Placing `<div className="w-full max-w-md mx-auto">` in `src/app/employee/layout.tsx` wraps all 16 pages automatically.
   - Adjusting `AppShell.tsx` to `mobileBottomNav ? "pb-28 lg:pb-8" : "pb-8"` provides guaranteed 112px clearance on mobile devices.

6. **Container vs Viewport Breakpoints Gotcha**:
   - When a container is locked to `max-w-md` (448px), responsive prefixes like `sm:grid-cols-2`, `sm:grid-cols-3`, `lg:grid-cols-4`, or `lg:grid-cols-2` still trigger on larger viewports (desktops, laptops).
   - Because the viewport is wide but the container is only 448px, multi-column layouts caused severe squishing (e.g. 4 columns of 95px in `monitoring`, 2 columns of 210px in `assets`).
   - Solution: In `/employee/*`, multi-column grid classes must be simplified to `grid-cols-1 gap-*` or `space-y-*` to preserve clean readability across all device viewport sizes.

7. **Strict Icon vs Emoji Policy**:
   - The user mandated: *"pastikan pakai icon yang tersedia ya, jangan pakai emoji"*.
   - All text emojis (`⚠️`, `✅`, `🏠`, `💼`), text arrows (`→`, `»`, `&rarr;`), and checkmark symbols (`✓`) across `/employee/*` have been replaced with proper SVG components from `lucide-react` (`<AlertCircle>`, `<CheckCircle>`, `<Check>`, `<ArrowRight>`, etc.).
   - Automated regex scanner confirmed 0 remaining emojis in all employee routes and layouts.

