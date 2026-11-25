import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        greetingRule: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        employeeGreetingQuote: {
            findMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import {
    DEFAULT_GREETING_COPY,
    FALLBACK_GREETING,
    formatGreetingDays,
    formatGreetingWindow,
    greetingRuleMatches,
    parseTimeToMinutes,
    pickDailyGreetingQuote,
    resolveGreetingForMoment,
    resolveGreetingSlot,
    shiftDateString,
    wibDayOfWeek,
    type GreetingQuoteLike,
    type GreetingRuleInput,
    type GreetingRuleLike,
} from "@/lib/greeting";
import {
    GREETING_EDITOR_KEY,
    canManageGreeting,
    createGreetingRule,
    deleteEmployeeGreetingQuote,
    deleteGreetingRule,
    getGreetingEditorEmployeeId,
    invalidateGreetingSettingsCache,
    isGreetingEditor,
    isWig001Session,
    listActiveGreetingQuotes,
    listActiveGreetingRules,
    listEmployeeGreetingQuotes,
    listGreetingEditorCandidates,
    listGreetingRules,
    submitEmployeeGreetingQuoteFromCheckin,
    updateEmployeeGreetingQuote,
    updateGreetingEditor,
    updateGreetingRule,
    validateGreetingRuleInput,
} from "@/lib/services/greetingSettingsService";

const mockedAppSetting = vi.mocked(prisma.appSetting);
const mockedEmployee = vi.mocked(prisma.employee);
const mockedGreetingRule = vi.mocked(prisma.greetingRule);
const mockedGreetingQuote = vi.mocked(prisma.employeeGreetingQuote);

function wig001Session() {
    return { username: "WIG001", permissions: ["hr.manage", "ga.manage"], employeeId: null } as never;
}

function wig002Session() {
    return { username: "WIG002", permissions: ["ga.manage"], employeeId: null } as never;
}

function employeeSession(employeeId: string) {
    return { username: employeeId, permissions: ["employee.self"], employeeId } as never;
}

function ruleRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "rule-1",
        name: "Sapaan Pagi",
        greeting: "Selamat Pagi!",
        subGreeting: "Awali hari dengan semangat.",
        startTime: "05:00",
        endTime: "11:00",
        repeatWeekly: true,
        daysOfWeek: "[1,2,3,4,5]",
        specificDate: null,
        priority: 10,
        isActive: true,
        ...overrides,
    };
}

function ruleInput(overrides: Partial<GreetingRuleInput> = {}): GreetingRuleInput {
    return {
        name: "Sapaan Pagi",
        greeting: "Selamat Pagi!",
        subGreeting: "Awali hari dengan semangat.",
        startTime: "05:00",
        endTime: "11:00",
        repeatWeekly: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        specificDate: null,
        priority: 10,
        isActive: true,
        ...overrides,
    };
}

function ruleLike(overrides: Partial<GreetingRuleLike> = {}): GreetingRuleLike {
    return {
        greeting: "Selamat Pagi!",
        subGreeting: "Awali hari dengan semangat.",
        startTime: "05:00",
        endTime: "11:00",
        repeatWeekly: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        specificDate: null,
        priority: 10,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    invalidateGreetingSettingsCache();
});

describe("helper waktu dan aturan sapaan", () => {
    it("memetakan jam WIB ke slot bawaan seperti perilaku lama", () => {
        expect(resolveGreetingSlot(null)).toBeNull();
        expect(resolveGreetingSlot(5)).toBe("pagi");
        expect(resolveGreetingSlot(10)).toBe("pagi");
        expect(resolveGreetingSlot(11)).toBe("siang");
        expect(resolveGreetingSlot(14)).toBe("siang");
        expect(resolveGreetingSlot(15)).toBe("sore");
        expect(resolveGreetingSlot(17)).toBe("sore");
        expect(resolveGreetingSlot(18)).toBe("malam");
        expect(resolveGreetingSlot(0)).toBe("malam");
        expect(resolveGreetingSlot(4)).toBe("malam");
    });

    it("mengurai jam HH:MM dan menolak format lain", () => {
        expect(parseTimeToMinutes("00:00")).toBe(0);
        expect(parseTimeToMinutes("23:59")).toBe(1439);
        expect(parseTimeToMinutes("24:00")).toBeNull();
        expect(parseTimeToMinutes("7:00")).toBeNull();
        expect(parseTimeToMinutes("07:60")).toBeNull();
        expect(parseTimeToMinutes("bukan jam")).toBeNull();
    });

    it("menghitung hari dan menggeser tanggal WIB", () => {
        expect(wibDayOfWeek("2026-11-16")).toBe(1);
        expect(wibDayOfWeek("2026-11-22")).toBe(0);
        expect(shiftDateString("2026-03-01", -1)).toBe("2026-02-28");
        expect(shiftDateString("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("mencocokkan jendela jam dan hari mingguan", () => {
        const rule = ruleLike();
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-16", hour: 9, minute: 0 })).toBe(true);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-16", hour: 4, minute: 59 })).toBe(false);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-16", hour: 11, minute: 0 })).toBe(false);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-22", hour: 9, minute: 0 })).toBe(false);
    });

    it("mendukung jendela lintas hari dengan hari keberangkatan", () => {
        const rule = ruleLike({ startTime: "22:00", endTime: "02:00", daysOfWeek: [1] });
        // Senin 22.00 dan Selasa 01.30 masih milik Senin.
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-16", hour: 22, minute: 0 })).toBe(true);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-17", hour: 1, minute: 30 })).toBe(true);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-17", hour: 22, minute: 0 })).toBe(false);
    });

    it("mencocokkan satu tanggal tertentu", () => {
        const rule = ruleLike({
            repeatWeekly: false,
            daysOfWeek: [],
            specificDate: "2026-11-16",
        });
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-16", hour: 9, minute: 0 })).toBe(true);
        expect(greetingRuleMatches(rule, { wibDate: "2026-11-17", hour: 9, minute: 0 })).toBe(false);
    });

    it("memilih prioritas tertinggi lalu jatuh ke teks bawaan", () => {
        const rules: GreetingRuleLike[] = [
            ruleLike({ greeting: "Prioritas Rendah", priority: 1 }),
            ruleLike({ greeting: "Prioritas Tinggi", priority: 99 }),
        ];
        expect(
            resolveGreetingForMoment(rules, { wibDate: "2026-11-16", hour: 9, minute: 0 }).greeting
        ).toBe("Prioritas Tinggi");

        expect(
            resolveGreetingForMoment([], { wibDate: "2026-11-16", hour: 9, minute: 0 })
        ).toEqual(DEFAULT_GREETING_COPY.pagi);
    });

    it("memformat label hari dan jendela jam", () => {
        expect(formatGreetingDays([1, 2, 3, 4, 5])).toBe("Sen, Sel, Rab, Kam, Jum");
        expect(formatGreetingDays([0, 1, 2, 3, 4, 5, 6])).toBe("Setiap hari");
        expect(formatGreetingWindow("08:00", "17:00")).toBe("08:00–17:00 WIB");
        expect(formatGreetingWindow("22:00", "02:00")).toBe("22:00–02:00 WIB (lintas hari)");
    });

    it("menjaga sapaan netral saat jam tidak diketahui", () => {
        expect(FALLBACK_GREETING.greeting).toBe("Selamat Datang!");
    });
});

describe("validasi aturan sapaan", () => {
    it("menormalkan teks dan hari", () => {
        const result = validateGreetingRuleInput(
            ruleInput({ name: "  Pagi  ", greeting: "  Halo  ", daysOfWeek: [5, 1, 1, 9] })
        );
        expect(result.name).toBe("Pagi");
        expect(result.greeting).toBe("Halo");
        expect(result.daysOfWeek).toEqual([1, 5]);
    });

    it("menolak input yang tidak lengkap atau tidak masuk akal", () => {
        expect(() => validateGreetingRuleInput(ruleInput({ name: "   " }))).toThrow();
        expect(() => validateGreetingRuleInput(ruleInput({ startTime: "7:00" }))).toThrow();
        expect(() => validateGreetingRuleInput(ruleInput({ startTime: "08:00", endTime: "08:00" }))).toThrow();
        expect(() => validateGreetingRuleInput(ruleInput({ daysOfWeek: [] }))).toThrow();
        expect(() =>
            validateGreetingRuleInput(ruleInput({ repeatWeekly: false, specificDate: "2026-02-30" }))
        ).toThrow();
        expect(() => validateGreetingRuleInput(ruleInput({ priority: 10000 }))).toThrow();
    });
});

describe("CRUD aturan sapaan", () => {
    it("membaca aturan, mengurai daysOfWeek, lalu memakai cache", async () => {
        mockedGreetingRule.findMany.mockResolvedValue([
            ruleRow(),
            ruleRow({ id: "rule-2", name: "Malam", daysOfWeek: "[0,6]", priority: 5 }),
        ] as never);

        const first = await listGreetingRules();
        const second = await listGreetingRules();

        expect(first[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);
        expect(first[1].daysOfWeek).toEqual([0, 6]);
        expect(second).toEqual(first);
        expect(mockedGreetingRule.findMany).toHaveBeenCalledTimes(1);
        expect(mockedGreetingRule.findMany).toHaveBeenCalledWith({
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        });
    });

    it("menyimpan aturan baru dengan JSON hari dan aktor", async () => {
        mockedGreetingRule.create.mockResolvedValue(ruleRow() as never);

        const saved = await createGreetingRule(ruleInput({ name: "  Pagi  " }), "user-1");

        expect(saved.name).toBe("Sapaan Pagi");
        expect(mockedGreetingRule.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                name: "Pagi",
                daysOfWeek: "[1,2,3,4,5]",
                createdByUserId: "user-1",
                updatedByUserId: "user-1",
            }),
        });
    });

    it("menolak aturan tidak valid tanpa menulis DB", async () => {
        await expect(createGreetingRule(ruleInput({ daysOfWeek: [] }))).rejects.toMatchObject({ statusCode: 400 });
        expect(mockedGreetingRule.create).not.toHaveBeenCalled();
    });

    it("memperbarui aturan dan menerjemahkan P2025 menjadi 404", async () => {
        mockedGreetingRule.update.mockResolvedValue(ruleRow({ name: "Diubah" }) as never);
        const updated = await updateGreetingRule("rule-1", ruleInput({ name: "Diubah" }), "user-1");
        expect(updated.name).toBe("Diubah");

        mockedGreetingRule.update.mockRejectedValue({ code: "P2025" });
        await expect(updateGreetingRule("rule-x", ruleInput())).rejects.toMatchObject({ statusCode: 404 });
    });

    it("menghapus aturan dan menerjemahkan P2025 menjadi 404", async () => {
        mockedGreetingRule.delete.mockResolvedValue({} as never);
        await expect(deleteGreetingRule("rule-1")).resolves.toBeUndefined();

        mockedGreetingRule.delete.mockRejectedValue({ code: "P2025" });
        await expect(deleteGreetingRule("rule-x")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("hanya mengirim aturan aktif ke client employee", async () => {
        mockedGreetingRule.findMany.mockResolvedValue([
            ruleRow(),
            ruleRow({ id: "rule-2", isActive: false }),
        ] as never);

        const rules = await listActiveGreetingRules();
        expect(rules).toHaveLength(1);
        expect(rules[0]).not.toHaveProperty("id");
        expect(rules[0]).not.toHaveProperty("name");
    });

    it("mengembalikan daftar kosong bila pembacaan gagal", async () => {
        mockedGreetingRule.findMany.mockRejectedValue(new Error("db down"));
        await expect(listActiveGreetingRules()).resolves.toEqual([]);
    });
});

describe("editor sapaan", () => {
    it("null saat belum ditunjuk", async () => {
        mockedAppSetting.findUnique.mockResolvedValue(null);
        await expect(getGreetingEditorEmployeeId()).resolves.toBeNull();
        await expect(isGreetingEditor(employeeSession("ID-1"))).resolves.toBe(false);
    });

    it("hanya karyawan yang ditunjuk dan masih aktif", async () => {
        mockedAppSetting.findUnique.mockResolvedValue({
            key: GREETING_EDITOR_KEY,
            value: "ID-1",
        } as never);
        mockedEmployee.findUnique.mockResolvedValue({ isActive: true } as never);

        await expect(isGreetingEditor(employeeSession("ID-1"))).resolves.toBe(true);
        await expect(isGreetingEditor(employeeSession("ID-2"))).resolves.toBe(false);

        mockedEmployee.findUnique.mockResolvedValue({ isActive: false } as never);
        await expect(isGreetingEditor(employeeSession("ID-1"))).resolves.toBe(false);
    });

    it("menolak karyawan nonaktif/outsource dan menerima internal aktif", async () => {
        mockedAppSetting.upsert.mockResolvedValue({} as never);

        mockedEmployee.findUnique.mockResolvedValue(null);
        await expect(updateGreetingEditor("ID-X", "wig002-id")).rejects.toMatchObject({ statusCode: 422 });

        mockedEmployee.findUnique.mockResolvedValue({
            employeeId: "ID-1",
            isActive: true,
            userAccount: { id: "u-1", isActive: true },
        } as never);
        await expect(updateGreetingEditor("  ID-1 ", "wig002-id")).resolves.toBe("ID-1");
        expect(mockedAppSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { key: GREETING_EDITOR_KEY }, update: { value: "ID-1", updatedByUserId: "wig002-id" } })
        );
    });

    it("mengosongkan penunjukan dengan string kosong", async () => {
        mockedAppSetting.upsert.mockResolvedValue({} as never);
        await expect(updateGreetingEditor("   ", "wig002-id")).resolves.toBeNull();
        expect(mockedAppSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: { value: "", updatedByUserId: "wig002-id" } })
        );
    });

    it("WIG002 selalu boleh; karyawan lain hanya bila ditunjuk", async () => {
        await expect(canManageGreeting(wig002Session())).resolves.toBe(true);

        mockedAppSetting.findUnique.mockResolvedValue(null);
        await expect(canManageGreeting(employeeSession("ID-9"))).resolves.toBe(false);
    });

    it("daftar kandidat hanya karyawan aktif dengan akun aktif", async () => {
        mockedEmployee.findMany.mockResolvedValue([
            { employeeId: "ID-1", name: "Ani" },
            { employeeId: "ID-2", name: "Budi" },
        ] as never);

        await expect(listGreetingEditorCandidates()).resolves.toEqual([
            { employeeId: "ID-1", name: "Ani" },
            { employeeId: "ID-2", name: "Budi" },
        ]);
        expect(mockedEmployee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { isActive: true, userAccount: { isActive: true } } })
        );
    });

    it("WIG001 (hr.manage) juga lolos canManageGreeting namun HR admin lain tidak", async () => {
        expect(isWig001Session(wig001Session())).toBe(true);
        await expect(canManageGreeting(wig001Session())).resolves.toBe(true);

        const otherHr = { username: "HR002", permissions: ["hr.manage"], employeeId: null } as never;
        expect(isWig001Session(otherHr)).toBe(false);
        await expect(canManageGreeting(otherHr)).resolves.toBe(false);
    });
});

describe("integrasi quotes karyawan (rotasi & kurasi)", () => {
    it("menormalkan authorName opsional pada GreetingRule dan menampilkannya saat rule cocok", () => {
        const normalized = validateGreetingRuleInput(ruleInput({ authorName: "  Daffa Fakhuddin  " }));
        expect(normalized.authorName).toBe("Daffa Fakhuddin");
        expect(validateGreetingRuleInput(ruleInput({ authorName: "   " })).authorName).toBeNull();

        const resolved = resolveGreetingForMoment(
            [ruleLike({ greeting: "Good Morning", authorName: "Daffa Fakhuddin" })],
            { wibDate: "2026-11-16", hour: 9, minute: 0 },
            [
                {
                    id: "q-1",
                    greeting: null,
                    quote: "Quote karyawan seharusnya kalah dari rule manual.",
                    authorName: "Sari",
                    slot: "PAGI",
                },
            ]
        );
        expect(resolved).toEqual({
            greeting: "Good Morning",
            subGreeting: "Awali hari dengan semangat.",
            authorName: "Daffa Fakhuddin",
        });
    });

    it("merotasi quotes karyawan disetujui secara deterministik per hari & slot WIB bila tidak ada GreetingRule yang cocok", () => {
        const quotes: GreetingQuoteLike[] = [
            { id: "q-1", greeting: null, quote: "Semangat pagi satu!", authorName: "Andi", slot: "PAGI" },
            { id: "q-2", greeting: "Good Morning", quote: "Semangat pagi dua!", authorName: "Daffa Fakhuddin", slot: "PAGI" },
            { id: "q-3", greeting: null, quote: "Tetap fokus malam hari.", authorName: null, slot: "MALAM" },
        ];

        const day1Pagi = resolveGreetingForMoment([], { wibDate: "2026-11-16", hour: 8, minute: 0 }, quotes);
        const day2Pagi = resolveGreetingForMoment([], { wibDate: "2026-11-17", hour: 8, minute: 0 }, quotes);
        expect(day1Pagi.subGreeting).not.toBe(day2Pagi.subGreeting);
        expect([day1Pagi.subGreeting, day2Pagi.subGreeting].sort()).toEqual([
            "Semangat pagi dua!",
            "Semangat pagi satu!",
        ]);

        // Slot siang tidak punya quote SIANG/ALL -> jatuh ke bawaan siang
        const siang = resolveGreetingForMoment([], { wibDate: "2026-11-16", hour: 12, minute: 30 }, quotes);
        expect(siang).toEqual(DEFAULT_GREETING_COPY.siang);

        // Slot malam mengambil quote MALAM dengan judul bawaan malam
        const malam = resolveGreetingForMoment([], { wibDate: "2026-11-16", hour: 20, minute: 0 }, quotes);
        expect(malam).toEqual({
            greeting: DEFAULT_GREETING_COPY.malam.greeting,
            subGreeting: "Tetap fokus malam hari.",
            authorName: null,
        });

        // Quote ALL berotasi antar slot pada hari yang sama
        const allQuotes: GreetingQuoteLike[] = [
            { id: "a-1", greeting: null, quote: "Semua waktu 1", authorName: "A", slot: "ALL" },
            { id: "a-2", greeting: null, quote: "Semua waktu 2", authorName: "B", slot: "ALL" },
        ];
        const pagiAll = pickDailyGreetingQuote(allQuotes, { wibDate: "2026-11-16", hour: 8, minute: 0 });
        const siangAll = pickDailyGreetingQuote(allQuotes, { wibDate: "2026-11-16", hour: 12, minute: 0 });
        expect(pagiAll?.id).not.toBe(siangAll?.id);
    });

    it("menyimpan quotes kiriman Stressmeter sebagai PENDING dengan authorName terisi otomatis tanpa gelar", async () => {
        mockedEmployee.findUnique.mockResolvedValueOnce({ name: "Daffa Fakhuddin, S.Kom." } as never);
        mockedGreetingQuote.create.mockResolvedValueOnce({ id: "q-new" } as never);

        const saved = await submitEmployeeGreetingQuoteFromCheckin(
            "ID-10",
            "2026-11-25",
            "  Jangan lupa tersenyum hari ini!  "
        );
        expect(saved).toBe(true);
        expect(mockedGreetingQuote.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                employeeId: "ID-10",
                quote: "Jangan lupa tersenyum hari ini!",
                authorName: "Daffa Fakhuddin",
                slot: "ALL",
                status: "PENDING",
            }),
        });

        // Duplicate P2002 ditangani secara idempoten
        mockedEmployee.findUnique.mockResolvedValueOnce({ name: "Daffa Fakhuddin" } as never);
        mockedGreetingQuote.create.mockRejectedValueOnce({ code: "P2002" });
        await expect(
            submitEmployeeGreetingQuoteFromCheckin("ID-10", "2026-11-25", "Duplikat")
        ).resolves.toBe(false);
    });

    it("mengambil daftar quotes aktif (APPROVED) dengan cache 60 detik dan membatalkan cache saat dikurasi", async () => {
        mockedGreetingQuote.findMany.mockResolvedValueOnce([
            { id: "q-1", greeting: "Good Morning", quote: "Gas pol!", authorName: "Daffa", slot: "PAGI" },
        ] as never);

        const first = await listActiveGreetingQuotes();
        const second = await listActiveGreetingQuotes();
        expect(first).toHaveLength(1);
        expect(second).toEqual(first);
        expect(mockedGreetingQuote.findMany).toHaveBeenCalledTimes(1);

        mockedGreetingQuote.update.mockResolvedValueOnce({
            id: "q-1",
            employeeId: "ID-10",
            shiftDate: new Date("2026-11-25T00:00:00.000Z"),
            greeting: "Selamat Pagi",
            quote: "Gas pol hari ini!",
            authorName: "Daffa",
            slot: "PAGI",
            status: "APPROVED",
            reviewedAt: new Date("2026-11-25T02:00:00.000Z"),
            createdAt: new Date("2026-11-25T01:00:00.000Z"),
            employee: { name: "Daffa Fakhuddin", departmentRel: { name: "IT" } },
        } as never);

        const curated = await updateEmployeeGreetingQuote(
            "q-1",
            {
                quote: "Gas pol hari ini!",
                greeting: "Selamat Pagi",
                authorName: "Daffa",
                slot: "PAGI",
                status: "APPROVED",
            },
            "wig001-id"
        );
        expect(curated.submitterName).toBe("Daffa Fakhuddin");
        expect(curated.departmentName).toBe("IT");

        mockedGreetingQuote.findMany.mockResolvedValueOnce([] as never);
        await listActiveGreetingQuotes();
        expect(mockedGreetingQuote.findMany).toHaveBeenCalledTimes(2);
    });

    it("menyajikan list kurasi beserta identitas pengirim dan menerjemahkan P2025 saat hapus/ubah", async () => {
        mockedGreetingQuote.count.mockResolvedValueOnce(1);
        mockedGreetingQuote.groupBy.mockResolvedValueOnce([
            { status: "PENDING", _count: { _all: 1 } },
        ] as never);
        mockedGreetingQuote.findMany.mockResolvedValueOnce([
            {
                id: "q-1",
                employeeId: "ID-10",
                shiftDate: new Date("2026-11-25T00:00:00.000Z"),
                greeting: null,
                quote: "Tetap semangat!",
                authorName: "Daffa Fakhuddin",
                slot: "ALL",
                status: "PENDING",
                reviewedAt: null,
                createdAt: new Date("2026-11-25T01:00:00.000Z"),
                employee: { name: "Daffa Fakhuddin", departmentRel: { name: "IT" } },
            },
        ] as never);

        const res = await listEmployeeGreetingQuotes({ status: "PENDING" });
        expect(res.counts).toEqual({ ALL: 1, PENDING: 1, APPROVED: 0, REJECTED: 0 });
        expect(res.items[0]).toMatchObject({
            employeeId: "ID-10",
            submitterName: "Daffa Fakhuddin",
            departmentName: "IT",
            shiftDate: "2026-11-25",
            status: "PENDING",
        });

        mockedGreetingQuote.delete.mockRejectedValueOnce({ code: "P2025" });
        await expect(deleteEmployeeGreetingQuote("missing")).rejects.toMatchObject({ statusCode: 404 });
    });
});
