# WIG HRIS — Coding Conventions & Best Practices

> v1.0 — April 2026

---

## 1. File Size & Modularity

- **Target:** ≤ 100 lines per file. If a file exceeds this, refactor into sub-modules.
- **Monolithic pages** (e.g. `dashboard/page.tsx` at 36KB) should be broken into:
  - Feature-specific components: `DashboardStats.tsx`, `AttendanceChart.tsx`
  - Hook files: `useDashboardData.ts`

**Example refactor:**
```
# Before
dashboard/page.tsx (1200 lines)

# After
dashboard/
  page.tsx              (50 lines — layout only)
  components/
    StatsCards.tsx       (80 lines)
    AttendanceChart.tsx  (60 lines)
    RecentActivity.tsx   (70 lines)
  hooks/
    useDashboardData.ts (40 lines)
```

---

## 2. Shared Utilities — Single Source of Truth

All reusable helpers must live in `src/lib/utils.ts` or a dedicated file under `src/lib/`.

| ✅ Do | ❌ Don't |
|-------|----------|
| `import { toDateString } from "@/lib/utils"` | Inline `const d2s = (d: Date) => ...` per file |
| One `SessionPayload` in `auth.ts`, re-exported where needed | Duplicate interface across 3 files |
| Shared validation helpers in `validationSchemas.ts` | Inline Zod schemas in each route |

**Date/Time helpers available in `utils.ts`:**
- `toDateString(d)` → `"YYYY-MM-DD"`
- `toISOOrNull(d)` → full ISO or null
- `toTimeString(d)` → `"HH:MM"`
- `toDateDisplay(d)` → `"YYYY-MM-DD"` or `"-"` for null
- `calculateDistance(lat1, lon1, lat2, lon2)` → meters

---

## 3. Type Safety

### Avoid `as unknown as Type`
Instead of casting Prisma results, create explicit mapper functions:

```typescript
// ✅ Good
function toEmployee(row: PrismaEmployee): Employee {
    return { id: row.id, name: row.name, ... };
}

// ❌ Bad
const employee = row as unknown as Employee;
```

### Avoid `z.any()` in Zod schemas
Use explicit types for payroll components:

```typescript
// ✅ Good
const payrollComponentSchema = z.object({
    name: z.string(),
    type: z.enum(["allowance", "deduction"]),
    amount: z.number(),
});
payrollComponents: z.array(payrollComponentSchema).optional()

// ❌ Bad
payrollComponents: z.array(z.any()).optional()
```

---

## 4. Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Files (service) | `camelCase.ts` | `attendanceService.ts` |
| Files (component) | `PascalCase.tsx` | `Employee360View.tsx` |
| Functions | `camelCase` | `createAttendance()` |
| Constants | `UPPER_SNAKE` | `MAX_RETRIES` |
| Types/Interfaces | `PascalCase` | `SessionPayload` |
| Boolean vars | `is/has/can` prefix | `isWithinRange` |
| API routes | `kebab-case` dirs | `change-password/route.ts` |

---

## 5. Error Handling

- Always use `serverErrorResponse(context, err)` from `apiGuard.ts`
- Always validate input with `validateBody(request, schema)` before processing
- Always check `requireAuth()` before any data access
- Log with `logger.info/warn/error` (Winston), not `console.log`

```typescript
// Standard API route pattern
export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, schema);
        if ("error" in result) return result.error;
        // ... business logic
    } catch (err) {
        return serverErrorResponse("ContextName", err);
    }
}
```

---

## 6. Export Strategy

Use **server-side** exports for Excel (API route + xlsx), and **client-side** exports only for PDF payslips (jsPDF needs browser canvas).

| Format | Where | Library |
|--------|-------|---------|
| Excel (.xlsx) | `api/export/route.ts` | xlsx |
| PDF payslip | `lib/export.ts` (client) | jsPDF |
| JSON preview | `api/export/route.ts` | native |

---

## 7. Database & Prisma

- Run `npx prisma generate` after any schema change
- Run `npx prisma db push` to apply schema changes
- Use `upsert` in seed scripts (idempotent)
- Store structured data in proper relational tables, not JSON strings
- Add `@unique` constraints for business-unique fields (email, assetCode)

---

## 8. Testing Recommendations

> ⚠️ Currently no test files exist. Priority areas for future testing:

1. **Unit tests:** `pph21Service.ts`, `overtimeCalcService.ts`, `bpjsService.ts` (complex math)
2. **Integration tests:** Leave balance recalculation, attendance flow
3. **Framework:** Vitest (compatible with Next.js)
4. **Target directory:** `src/__tests__/` or co-located `*.test.ts`
