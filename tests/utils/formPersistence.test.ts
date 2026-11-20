import { describe, expect, it } from "vitest";
import {
    ACTIVE_OWNER_KEY,
    DEFAULT_DRAFT_TTL_MS,
    DRAFT_STORAGE_PREFIX,
    buildDraftStorageKey,
    buildOwnerScope,
    clearAllEmployeeDrafts,
    clearEmployeeDraftsForOwner,
    deepEqual,
    formatReattachHint,
    isPlainObject,
    pruneExpiredEmployeeDrafts,
    readEmployeeDraft,
    removeEmployeeDraft,
    syncActiveDraftOwner,
    writeEmployeeDraft,
} from "@/lib/formPersistence";

class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    public throwQuotaOnSet = false;
    public maxEntries: number | null = null;

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        if (this.throwQuotaOnSet) {
            throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }
        if (this.maxEntries !== null && !this.store.has(key) && this.store.size >= this.maxEntries) {
            throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }
        this.store.set(key, value);
    }
}

describe("formPersistence engine", () => {
    it("persists and restores a valid draft for the same authenticated owner", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001");
        expect(owner).toBe("user-1::EMP001");

        const written = writeEmployeeDraft(
            owner,
            "overtime:create",
            { reason: "Deploy produksi", hours: 2 },
            { storage, now: 1_000 }
        );
        expect(written).toBe(true);

        const read = readEmployeeDraft<{ reason: string; hours: number }>(
            owner,
            "overtime:create",
            {
                storage,
                now: 2_000,
                validate: (v): v is { reason: string; hours: number } =>
                    isPlainObject(v) && typeof v.reason === "string" && typeof v.hours === "number",
            }
        );
        expect(read).toEqual({
            status: "found",
            data: { reason: "Deploy produksi", hours: 2 },
            updatedAt: 1_000,
            baseline: undefined,
        });
    });

    it("strictly isolates drafts between different user accounts and sweeps foreign drafts on account switch", () => {
        const storage = new MemoryStorage();
        const ownerA = buildOwnerScope("user-A", "EMP001")!;
        const ownerB = buildOwnerScope("user-B", "EMP002")!;

        writeEmployeeDraft(ownerA, "leave:create", { reason: "Cuti A" }, { storage, now: 1_000 });
        writeEmployeeDraft(ownerA, "todos:create", { newTodo: "Rahasia A" }, { storage, now: 1_000 });

        // Owner B cannot read Owner A's draft even before sweeping.
        expect(readEmployeeDraft(ownerB, "leave:create", { storage, now: 2_000 })).toEqual({
            status: "missing",
        });

        // Tampered envelope with mismatched internal owner is rejected & purged.
        const tamperedKey = buildDraftStorageKey(ownerB, "leave:create");
        storage.setItem(
            tamperedKey,
            JSON.stringify({
                version: 1,
                owner: ownerA,
                formKey: "leave:create",
                updatedAt: 1_000,
                expiresAt: 1_000 + DEFAULT_DRAFT_TTL_MS,
                data: { reason: "Leaked" },
            })
        );
        expect(readEmployeeDraft(ownerB, "leave:create", { storage, now: 2_000 })).toEqual({
            status: "invalid",
        });
        expect(storage.getItem(tamperedKey)).toBeNull();

        // When Owner B activates a session, all Owner A drafts are swept immediately.
        const sweep = syncActiveDraftOwner(ownerB, storage, 2_000);
        expect(sweep.sweptForeignCount).toBe(2);
        expect(storage.getItem(ACTIVE_OWNER_KEY)).toBe(ownerB);
        expect(readEmployeeDraft(ownerA, "leave:create", { storage, now: 2_000 })).toEqual({
            status: "missing",
        });
    });

    it("isolates distinct forms and distinct entity contexts within the same form", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001")!;

        writeEmployeeDraft(owner, "assets:ticket:damage:asset-1", { title: "Laptop A rusak" }, { storage, now: 1_000 });
        writeEmployeeDraft(owner, "assets:ticket:damage:asset-2", { title: "Monitor B mati" }, { storage, now: 1_000 });
        writeEmployeeDraft(owner, "assets:ticket:new", { title: "Request Mouse" }, { storage, now: 1_000 });

        expect(readEmployeeDraft(owner, "assets:ticket:damage:asset-1", { storage, now: 2_000 })).toMatchObject({
            status: "found",
            data: { title: "Laptop A rusak" },
        });
        expect(readEmployeeDraft(owner, "assets:ticket:damage:asset-2", { storage, now: 2_000 })).toMatchObject({
            status: "found",
            data: { title: "Monitor B mati" },
        });
        expect(readEmployeeDraft(owner, "assets:ticket:new", { storage, now: 2_000 })).toMatchObject({
            status: "found",
            data: { title: "Request Mouse" },
        });

        // Clearing one entity does not disturb siblings.
        removeEmployeeDraft(owner, "assets:ticket:damage:asset-1", storage);
        expect(readEmployeeDraft(owner, "assets:ticket:damage:asset-1", { storage, now: 2_000 })).toEqual({
            status: "missing",
        });
        expect(readEmployeeDraft(owner, "assets:ticket:damage:asset-2", { storage, now: 2_000 })).toMatchObject({
            status: "found",
            data: { title: "Monitor B mati" },
        });
    });

    it("rejects stale edit drafts when fresher server baseline data exists", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001")!;

        // User began editing phone when server value was "08111".
        writeEmployeeDraft(
            owner,
            "profile:phone",
            { phone: "08999" },
            { storage, now: 1_000, baseline: "08111", hasBaseline: true }
        );

        // Matching server baseline restores the draft.
        expect(
            readEmployeeDraft(owner, "profile:phone", {
                storage,
                now: 2_000,
                expectedBaseline: "08111",
                hasExpectedBaseline: true,
            })
        ).toMatchObject({
            status: "found",
            data: { phone: "08999" },
        });

        // HR updated phone on server to "08222" -> stale draft must be discarded!
        expect(
            readEmployeeDraft(owner, "profile:phone", {
                storage,
                now: 3_000,
                expectedBaseline: "08222",
                hasExpectedBaseline: true,
            })
        ).toEqual({ status: "stale" });

        // Stale draft was auto-purged from storage.
        expect(storage.getItem(buildDraftStorageKey(owner, "profile:phone"))).toBeNull();
    });

    it("clears all drafts on explicit logout without touching unrelated application storage keys", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001")!;

        storage.setItem("employee-sidebar-collapsed", "true");
        writeEmployeeDraft(owner, "todos:create", { newTodo: "A" }, { storage, now: 1_000 });
        writeEmployeeDraft(owner, "overtime:create", { reason: "B" }, { storage, now: 1_000 });

        const removed = clearAllEmployeeDrafts(storage);
        expect(removed).toBe(2);
        expect(storage.getItem("employee-sidebar-collapsed")).toBe("true");
        expect(storage.getItem(ACTIVE_OWNER_KEY)).toBeNull();

        // Owner-scoped clear also works cleanly.
        writeEmployeeDraft(owner, "todos:create", { newTodo: "C" }, { storage, now: 1_000 });
        expect(clearEmployeeDraftsForOwner(owner, storage)).toBe(1);
    });

    it("expires drafts past TTL and recovers cleanly from corrupted JSON or invalid schemas", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001")!;

        writeEmployeeDraft(owner, "todos:create", { newTodo: "Old" }, { storage, now: 1_000, ttlMs: 5_000 });
        expect(readEmployeeDraft(owner, "todos:create", { storage, now: 6_001 })).toEqual({
            status: "expired",
        });
        expect(storage.getItem(buildDraftStorageKey(owner, "todos:create"))).toBeNull();

        // Corrupted JSON is auto-removed without throwing.
        const badKey = buildDraftStorageKey(owner, "documents:letter-request");
        storage.setItem(badKey, "{not-valid-json");
        expect(readEmployeeDraft(owner, "documents:letter-request", { storage, now: 2_000 })).toEqual({
            status: "invalid",
        });
        expect(storage.getItem(badKey)).toBeNull();

        // Schema mismatch fails validation & auto-removes entry.
        writeEmployeeDraft(owner, "documents:letter-request", { wrongField: 123 }, { storage, now: 1_000 });
        expect(
            readEmployeeDraft<{ purpose: string }>(owner, "documents:letter-request", {
                storage,
                now: 2_000,
                validate: (v): v is { purpose: string } => isPlainObject(v) && typeof v.purpose === "string",
            })
        ).toEqual({ status: "invalid" });
    });

    it("handles QuotaExceededError gracefully by pruning expired drafts and retrying without throwing", () => {
        const storage = new MemoryStorage();
        const owner = buildOwnerScope("user-1", "EMP001")!;

        // Fill storage with 1 expired draft and cap at 1 entry.
        writeEmployeeDraft(owner, "old:form", { x: 1 }, { storage, now: 1_000, ttlMs: 1_000 });
        storage.maxEntries = 1;

        // Writing a new draft at t=5_000 triggers prune of expired draft, then succeeds!
        const ok = writeEmployeeDraft(owner, "new:form", { x: 2 }, { storage, now: 5_000 });
        expect(ok).toBe(true);
        expect(readEmployeeDraft(owner, "new:form", { storage, now: 5_100 })).toMatchObject({
            status: "found",
            data: { x: 2 },
        });

        // Even when storage permanently throws QuotaExceededError, write fails silently (returns false).
        storage.throwQuotaOnSet = true;
        expect(() => writeEmployeeDraft(owner, "another:form", { x: 3 }, { storage, now: 5_200 })).not.toThrow();
        expect(writeEmployeeDraft(owner, "another:form", { x: 3 }, { storage, now: 5_200 })).toBe(false);
    });

    it("provides accurate deepEqual, pruneExpiredEmployeeDrafts, and attachment hint helpers", () => {
        expect(deepEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 })).toBe(true);
        expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [3, 2] })).toBe(false);

        expect(formatReattachHint([])).toBeNull();
        expect(formatReattachHint(["surat-dokter.pdf"])).toBe(
            "Lampiran sebelumnya (surat-dokter.pdf) perlu dipilih ulang sebelum mengirim."
        );
        expect(formatReattachHint(["a.jpg", "b.pdf", "c.png"])).toBe(
            "3 lampiran sebelumnya (a.jpg, b.pdf, ...) perlu dipilih ulang sebelum mengirim."
        );

        const storage = new MemoryStorage();
        storage.setItem(`${DRAFT_STORAGE_PREFIX}bad`, "corrupt");
        expect(pruneExpiredEmployeeDrafts(storage, 10_000)).toBe(1);
    });
});
