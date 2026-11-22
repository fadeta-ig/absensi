"use client";

import { useEffect, useState } from "react";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import { extractOsUserIdFromToken, toOsActorToken } from "@/lib/services/equipmentAuth";

export type EquipmentActorRole = "operator" | "qc" | "approver";

interface EligibleOsUser {
    userId: string;
    username: string;
    displayName: string;
    email: string;
}

interface EquipmentActorPickerProps {
    role: EquipmentActorRole;
    label: string;
    value: EmployeePick | null;
    onChange: (pick: EmployeePick | null) => void;
    placeholder?: string;
}

export default function EquipmentActorPicker({
    role,
    label,
    value,
    onChange,
    placeholder,
}: EquipmentActorPickerProps) {
    const valueIsOs = Boolean(value && extractOsUserIdFromToken(value.employeeId));
    const [manualMode, setManualMode] = useState<"internal" | "outsource">(
        valueIsOs ? "outsource" : "internal"
    );
    const mode: "internal" | "outsource" = valueIsOs ? "outsource" : manualMode;
    const [osUsers, setOsUsers] = useState<EligibleOsUser[]>([]);
    const [loadedRole, setLoadedRole] = useState<EquipmentActorRole | null>(null);

    useEffect(() => {
        if (mode !== "outsource") return;
        let cancelled = false;
        fetch(`/api/ga/equipment/eligible-outsource?role=${role}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (!cancelled) {
                    setOsUsers(json?.data ?? []);
                    setLoadedRole(role);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setOsUsers([]);
                    setLoadedRole(role);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [mode, role]);

    const loadingOs = mode === "outsource" && loadedRole !== role;

    const switchMode = (next: "internal" | "outsource") => {
        if (next === mode) return;
        setManualMode(next);
        onChange(null);
    };

    const selectedOsUserId = value ? extractOsUserIdFromToken(value.employeeId) ?? "" : "";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{label}</span>
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-[11px]">
                    <button
                        type="button"
                        onClick={() => switchMode("internal")}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                            mode === "internal"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Karyawan
                    </button>
                    <button
                        type="button"
                        onClick={() => switchMode("outsource")}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                            mode === "outsource"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Outsource (OS)
                    </button>
                </div>
            </div>

            {mode === "internal" ? (
                <EmployeeSearchPicker
                    label=""
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                />
            ) : (
                <div>
                    <select
                        value={selectedOsUserId}
                        onChange={(e) => {
                            const uid = e.target.value;
                            if (!uid) {
                                onChange(null);
                                return;
                            }
                            const found = osUsers.find((u) => u.userId === uid);
                            onChange({
                                employeeId: toOsActorToken(uid),
                                name: found ? `${found.displayName} (@${found.username})` : uid,
                            });
                        }}
                        disabled={loadingOs}
                        aria-label={`Pilih akun outsource untuk ${label}`}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm min-h-[42px]"
                    >
                        <option value="">
                            {loadingOs
                                ? "Memuat daftar akun OS…"
                                : osUsers.length === 0
                                    ? "Belum ada akun OS ber-RBAC aktif untuk peran ini"
                                    : "-- Pilih akun Outsource (OS) --"}
                        </option>
                        {osUsers.map((u) => (
                            <option key={u.userId} value={u.userId}>
                                {u.displayName} (@{u.username})
                            </option>
                        ))}
                    </select>
                    {!loadingOs && osUsers.length === 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Aktifkan izin modul pada akun OS terlebih dahulu di menu <strong>Akun Outsource (OS)</strong>{" "}
                            (WIG002).
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
