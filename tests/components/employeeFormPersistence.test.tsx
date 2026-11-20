// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeDraftProvider } from "@/components/employee/EmployeeDraftContext";
import {
    DRAFT_STORAGE_PREFIX,
    buildDraftStorageKey,
    buildOwnerScope,
    clearAllEmployeeDrafts,
} from "@/lib/formPersistence";
import TodosPage from "@/app/employee/todos/page";
import EmployeeOvertimePage from "@/app/employee/overtime/page";
import EmployeeAssetsPage from "@/app/employee/assets/page";
import AttendanceCorrectionPage from "@/app/employee/attendance/correction/page";
import ProfilePage from "@/app/employee/profile/page";
import CreateMyTaskPage from "@/app/employee/my-tasks/create/page";
import { ChangePasswordCard } from "@/app/employee/profile/components/ChangePasswordCard";
import DocumentsPage from "@/app/employee/documents/page";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
    confirm: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    reportClientError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/components/ConfirmModal", () => ({ useConfirm: () => mocks.confirm }));
vi.mock("@/hooks/useEmployeeLogout", () => ({
    useEmployeeLogout: () => ({ logout: mocks.logout, loggingOut: false }),
}));
vi.mock("@/hooks/useAttendanceServerContext", () => ({
    useAttendanceServerContext: () => ({
        context: { serverWibDate: "2026-09-29" },
        isOnline: true,
        isFresh: true,
        refresh: mocks.refresh,
    }),
}));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: mocks.reportClientError,
    getResponseErrorMessage: vi.fn(async (_res: Response, fallback: string) => fallback),
}));

function jsonResponse(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

function renderAsEmployee(
    ui: React.ReactNode,
    user = { userId: "user-A", employeeId: "EMP001" }
) {
    return render(
        <EmployeeDraftProvider userId={user.userId} employeeId={user.employeeId}>
            {ui}
        </EmployeeDraftProvider>
    );
}

describe("Employee Portal Form Persistence — 12 Simulation Scenarios", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        window.localStorage.clear();
    });

    it("Scenarios 1, 2, 3, 4: restores unfinished input after refresh, tab close (pagehide), and navigating away/back", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes("/api/todos")) return jsonResponse([]);
            if (String(input).includes("/api/overtime")) return jsonResponse([]);
            return jsonResponse({});
        }));

        // Fill TodosPage & simulate sudden refresh/close BEFORE debounce finishes (via pagehide + unmount).
        const view1 = renderAsEmployee(<TodosPage />);
        const todoInput = await screen.findByPlaceholderText("Tambahkan tugas baru...");
        await user.type(todoInput, "Siapkan laporan mingguan");
        act(() => {
            window.dispatchEvent(new Event("pagehide"));
        });
        view1.unmount();

        // Navigate to another form (Overtime) and fill unfinished draft there too.
        const view2 = renderAsEmployee(<EmployeeOvertimePage />);
        await user.click(await screen.findByRole("button", { name: /Ajukan Lembur/i }));
        const reasonArea = await screen.findByPlaceholderText(/Jelaskan alasan dan pekerjaan/i);
        await user.type(reasonArea, "Deployment rilis malam");
        view2.unmount();

        // Return to TodosPage -> draft is restored without mixing with Overtime!
        const view3 = renderAsEmployee(<TodosPage />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("Siapkan laporan mingguan");
        });
        expect(screen.getByText(/Pengisian sebelumnya dipulihkan/i)).toBeInTheDocument();
        view3.unmount();

        // Return to OvertimePage -> modal reopens automatically with exact unfinished data!
        renderAsEmployee(<EmployeeOvertimePage />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Jelaskan alasan dan pekerjaan/i)).toHaveValue("Deployment rilis malam");
        });
    });

    it("Scenario 5: preserves multi-field / multi-step operational task draft across leave & return", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes("/api/auth/me")) {
                return jsonResponse({ employeeId: "EMP001", name: "Andi" });
            }
            if (String(input).includes("/api/my-tasks/recipients")) {
                return jsonResponse({
                    data: [
                        { employeeId: "EMP002", name: "Budi", department: "IT", division: "Ops", position: "Staff" },
                        { employeeId: "EMP003", name: "Citra", department: "HR", division: "Ops", position: "Staff" },
                    ],
                });
            }
            return jsonResponse({});
        }));

        const view1 = renderAsEmployee(<CreateMyTaskPage />);
        await screen.findByText(/Budi/);
        await user.type(screen.getByLabelText(/Judul tugas/i), "Audit aset server");
        await user.type(screen.getByLabelText(/Rincian/i), "Cek rak A dan rak B");
        await user.click(screen.getByRole("checkbox", { name: /Budi/i }));
        fireEvent.change(screen.getByLabelText(/Tanggal deadline/i), { target: { value: "2026-10-05" } });
        fireEvent.change(screen.getByLabelText(/Jam deadline/i), { target: { value: "16:30" } });
        view1.unmount();

        // Reopen CreateMyTaskPage -> all steps/fields restored cleanly.
        renderAsEmployee(<CreateMyTaskPage />);
        await waitFor(() => {
            expect(screen.getByLabelText(/Judul tugas/i)).toHaveValue("Audit aset server");
            expect(screen.getByLabelText(/Rincian/i)).toHaveValue("Cek rak A dan rak B");
            expect(screen.getByLabelText(/Tanggal deadline/i)).toHaveValue("2026-10-05");
            expect(screen.getByLabelText(/Jam deadline/i)).toHaveValue("16:30");
            expect(screen.getByRole("checkbox", { name: /Budi/i })).toBeChecked();
        });
    });

    it("Scenarios 6 & 7: retains draft on failed submission, clears cleanly on successful submission and does not resurrect", async () => {
        const user = userEvent.setup();
        let shouldFail = true;
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            if ((init?.method ?? "GET") === "POST") {
                if (shouldFail) {
                    return jsonResponse({ error: "Server sedang sibuk" }, 500);
                }
                return jsonResponse({ id: "todo-99", text: "Catatan penting", completed: false, createdAt: "2026-09-29T00:00:00Z" });
            }
            return jsonResponse([]);
        }));

        // Attempt 1: submission FAILS -> input & draft stay intact!
        const view1 = renderAsEmployee(<TodosPage />);
        const input = await screen.findByPlaceholderText("Tambahkan tugas baru...");
        await user.type(input, "Catatan penting");
        await user.click(screen.getByRole("button", { name: /Tambah/i }));

        await waitFor(() => {
            expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), "error");
        });
        expect(input).toHaveValue("Catatan penting");
        view1.unmount();

        // Reload after failure -> draft is still available for retry!
        shouldFail = false;
        const view2 = renderAsEmployee(<TodosPage />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("Catatan penting");
        });

        // Attempt 2: submission SUCCEEDS -> input & draft cleared!
        await user.click(screen.getByRole("button", { name: /Tambah/i }));
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("");
        });
        view2.unmount();

        // Reload after success -> submitted text NEVER resurrects!
        renderAsEmployee(<TodosPage />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("");
        });
        expect(screen.queryByText(/Pengisian sebelumnya dipulihkan/i)).not.toBeInTheDocument();
    });

    it("Scenarios 8 & 9: clears drafts on explicit logout and prevents cross-account leakage on account switch", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));

        // Account A types an unfinished draft.
        const viewA = renderAsEmployee(<TodosPage />, { userId: "user-A", employeeId: "EMP001" });
        await user.type(await screen.findByPlaceholderText("Tambahkan tugas baru..."), "Draft privat Akun A");
        viewA.unmount();

        const keyA = buildDraftStorageKey(buildOwnerScope("user-A", "EMP001")!, "todos:create");
        expect(window.localStorage.getItem(keyA)).not.toBeNull();

        // Scenario 9: Switch directly to Account B -> Account B sees empty form & Account A draft is swept!
        const viewB = renderAsEmployee(<TodosPage />, { userId: "user-B", employeeId: "EMP002" });
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("");
            expect(window.localStorage.getItem(keyA)).toBeNull();
        });
        await user.type(screen.getByPlaceholderText("Tambahkan tugas baru..."), "Draft Akun B");
        viewB.unmount();

        // Scenario 8: Explicit logout clears all drafts; logging back in starts fresh.
        clearAllEmployeeDrafts();
        renderAsEmployee(<TodosPage />, { userId: "user-B", employeeId: "EMP002" });
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Tambahkan tugas baru...")).toHaveValue("");
        });
    });

    it("Scenario 10: isolates drafts when opening the same form for different entities (Asset A vs Asset B)", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async () =>
            jsonResponse({
                assets: [
                    { id: "asset-1", assetCode: "LPT-01", name: "Laptop Alpha", serialNumber: "SN1", kondisi: "BAIK", categoryRel: { name: "Laptop", prefix: "LPT" } },
                    { id: "asset-2", assetCode: "MON-02", name: "Monitor Beta", serialNumber: "SN2", kondisi: "BAIK", categoryRel: { name: "Monitor", prefix: "MON" } },
                ],
                tickets: [],
            })
        ));

        const view1 = renderAsEmployee(<EmployeeAssetsPage />);
        const reportButtons = await screen.findAllByRole("button", { name: /Lapor Kendala/i });

        // Open damage report for Asset 1 and type description A.
        await user.click(reportButtons[0]);
        const desc1 = await screen.findByPlaceholderText(/Jelaskan kronologi/i);
        await user.type(desc1, "Keyboard tombol enter macet total");
        await user.click(screen.getByRole("button", { name: /^Batal$/i }));

        // Open damage report for Asset 2 -> MUST NOT see Asset 1's description!
        await user.click(reportButtons[1]);
        const desc2 = await screen.findByPlaceholderText(/Jelaskan kronologi/i);
        expect(desc2).toHaveValue("");
        await user.type(desc2, "Layar monitor berkedip saat menyala");
        view1.unmount();

        // Reload page -> Asset 2 modal reopens with Asset 2's draft, and switching back to Asset 1 restores Asset 1's draft!
        renderAsEmployee(<EmployeeAssetsPage />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Jelaskan kronologi/i)).toHaveValue("Layar monitor berkedip saat menyala");
        });
        await user.click(screen.getByRole("button", { name: /^Batal$/i }));
        const refreshedReportButtons = await screen.findAllByRole("button", { name: /Lapor Kendala/i });
        await user.click(refreshedReportButtons[0]);
        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Jelaskan kronologi/i)).toHaveValue("Keyboard tombol enter macet total");
        });
    });

    it("Scenario 11: restores non-file inputs and shows clear re-attach reminder without storing binary file data", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes("/api/attendance/shift-schedule")) {
                return jsonResponse({ schedule: null });
            }
            return jsonResponse([]);
        }));

        const view1 = renderAsEmployee(<AttendanceCorrectionPage />);
        await user.click(await screen.findByRole("button", { name: /Ajukan Koreksi/i }));
        fireEvent.change(screen.getByLabelText(/Jam Keluar \(Diajukan\)/i), { target: { value: "17:30" } });
        await user.type(screen.getByLabelText(/Alasan \/ Keterangan/i), "Lupa clock out karena meeting mendadak");

        // Attach a local PDF file.
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const pdf = new File(["dummy-pdf-bytes"], "bukti-dinas.pdf", { type: "application/pdf" });
        fireEvent.change(fileInput, { target: { files: [pdf] } });
        view1.unmount();

        // Verify localStorage does NOT contain binary file bytes.
        const storedRaw = window.localStorage.getItem(
            buildDraftStorageKey(buildOwnerScope("user-A", "EMP001")!, "attendance:correction")
        );
        expect(storedRaw).not.toBeNull();
        expect(storedRaw).not.toContain("dummy-pdf-bytes");

        // Reload -> text fields restored AND clear re-attach reminder shown!
        renderAsEmployee(<AttendanceCorrectionPage />);
        await waitFor(() => {
            expect(screen.getByLabelText(/Alasan \/ Keterangan/i)).toHaveValue(
                "Lupa clock out karena meeting mendadak"
            );
            expect(screen.getByLabelText(/Jam Keluar \(Diajukan\)/i)).toHaveValue("17:30");
            expect(
                screen.getByText(/Lampiran sebelumnya \(bukti-dinas\.pdf\) perlu dipilih ulang sebelum mengirim\./i)
            ).toBeInTheDocument();
        });
    });

    it("Scenario 12: never overwrites fresher server data with a stale local edit draft", async () => {
        const user = userEvent.setup();
        let serverPhone = "0811111111";
        vi.stubGlobal("fetch", vi.fn(async () =>
            jsonResponse({
                id: "emp-1",
                employeeId: "EMP001",
                name: "Andi Wijaya",
                email: "andi@example.com",
                phone: serverPhone,
                avatarUrl: null,
                department: "IT",
                division: "Core",
                position: "Engineer",
                role: "employee",
                joinDate: "2024-01-01T00:00:00Z",
                totalLeave: 12,
                usedLeave: 2,
                isActive: true,
                managerName: null,
            })
        ));

        // User starts editing phone from "0811111111" -> "0899999999" and leaves without saving.
        const view1 = renderAsEmployee(<ProfilePage />);
        await user.click(await screen.findByRole("button", { name: /Data Pribadi/i }));
        const phoneInput = await screen.findByPlaceholderText(/Contoh: 08123456789/i);
        await user.clear(phoneInput);
        await user.type(phoneInput, "0899999999");
        view1.unmount();

        // Meanwhile HR updates official phone on server to "0822222222".
        serverPhone = "0822222222";

        // User reopens ProfilePage -> stale draft MUST be discarded; fresh server value "0822222222" wins!
        renderAsEmployee(<ProfilePage />);
        await user.click(await screen.findByRole("button", { name: /Data Pribadi/i }));
        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Contoh: 08123456789/i)).toHaveValue("0822222222");
        });
        expect(screen.queryByText(/Pengisian sebelumnya dipulihkan/i)).not.toBeInTheDocument();
    });

    it("Security Exclusion: never stores plaintext password inputs in localStorage", async () => {
        const user = userEvent.setup();
        renderAsEmployee(<ChangePasswordCard />);

        await user.type(screen.getByPlaceholderText("Masukkan kata sandi saat ini"), "OldSecret123!");
        await user.type(screen.getByPlaceholderText("Minimal 8 karakter"), "NewSecret456!");
        await user.type(screen.getByPlaceholderText("Ulangi kata sandi baru"), "NewSecret456!");

        act(() => {
            window.dispatchEvent(new Event("pagehide"));
        });

        const draftKeys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const k = window.localStorage.key(i);
            if (k?.startsWith(DRAFT_STORAGE_PREFIX)) draftKeys.push(k);
        }
        expect(draftKeys).toHaveLength(0);
    });

    it("Modal with non-text radio choices (DocumentsPage): persists selected letter type & purpose and clears on submit", async () => {
        const user = userEvent.setup();
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            if ((init?.method ?? "GET") === "POST") {
                return jsonResponse({
                    id: "let-1",
                    type: "BPJS",
                    purpose: "Administrasi klaim",
                    status: "PENDING",
                    notes: null,
                    createdAt: "2026-09-29T00:00:00Z",
                    updatedAt: "2026-09-29T00:00:00Z",
                });
            }
            return jsonResponse([]);
        }));

        const view1 = renderAsEmployee(<DocumentsPage />);
        await user.click(await screen.findByRole("button", { name: /Minta Surat/i }));
        await user.click(screen.getByRole("radio", { name: /Surat Keterangan BPJS/i }));
        await user.type(screen.getByPlaceholderText(/Contoh: Untuk pengajuan kredit/i), "Administrasi klaim");
        view1.unmount();

        // Reload -> modal reopens with BPJS selected & purpose preserved!
        const view2 = renderAsEmployee(<DocumentsPage />);
        await waitFor(() => {
            expect(screen.getByRole("radio", { name: /Surat Keterangan BPJS/i })).toHaveAttribute("aria-checked", "true");
            expect(screen.getByPlaceholderText(/Contoh: Untuk pengajuan kredit/i)).toHaveValue("Administrasi klaim");
        });

        // Submit succeeds -> draft cleared!
        await user.click(screen.getByRole("button", { name: /Kirim Permintaan ke HR/i }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        view2.unmount();

        // Reopen -> clean default (no resurrected draft).
        renderAsEmployee(<DocumentsPage />);
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("Shared components (GreetingSettingsPanel & EquipmentEvidencePanel): persist inside Employee Portal with staleness guard and safely no-op outside", async () => {
        const user = userEvent.setup();
        let serverGreetingText = "Selamat Pagi Lama";
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/ga/greeting-settings")) {
                return jsonResponse({
                    data: {
                        rules: [
                            {
                                id: "rule-1",
                                name: "Sapaan Pagi",
                                greeting: serverGreetingText,
                                subGreeting: "Semangat kerja",
                                startTime: "06:00",
                                endTime: "10:00",
                                repeatWeekly: true,
                                daysOfWeek: [1, 2, 3, 4, 5],
                                specificDate: null,
                                priority: 10,
                                isActive: true,
                            },
                        ],
                    },
                });
            }
            if (url.includes("/api/employee/equipment/evidence")) {
                return jsonResponse({ success: true, data: [] });
            }
            return jsonResponse({});
        }));

        // 1. Inside Employee Portal: edit Greeting rule & leave unfinished -> restored when server unchanged!
        const view1 = renderAsEmployee(<GreetingSettingsPanel />);
        await user.click(await screen.findByRole("button", { name: /Ubah/i }));
        const greetingInput = await screen.findByLabelText(/Teks sapaan/i);
        await user.clear(greetingInput);
        await user.type(greetingInput, "Selamat Pagi Draf Baru");
        view1.unmount();

        const view2 = renderAsEmployee(<GreetingSettingsPanel />);
        await waitFor(() => {
            expect(screen.getByLabelText(/Teks sapaan/i)).toHaveValue("Selamat Pagi Draf Baru");
        });
        view2.unmount();

        // 2. Server updates rule while draft sits locally -> stale draft MUST NOT overwrite newer server value!
        serverGreetingText = "Selamat Pagi Resmi Terbaru";
        const view3 = renderAsEmployee(<GreetingSettingsPanel />);
        await screen.findByText("Selamat Pagi Resmi Terbaru");
        expect(screen.queryByDisplayValue("Selamat Pagi Draf Baru")).not.toBeInTheDocument();
        view3.unmount();

        // 3. Shared EquipmentEvidencePanel rendered OUTSIDE EmployeeDraftProvider (e.g., GA portal) writes ZERO drafts!
        window.localStorage.clear();
        const gaView = render(<EquipmentEvidencePanel inspectionId="insp-1" canUpload />);
        const noteInput = await screen.findByPlaceholderText(/Catatan foto/i);
        await user.type(noteInput, "Catatan GA");
        gaView.unmount();
        expect(window.localStorage.length).toBe(0);
    });
});
