"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

interface Room {
    id: string;
    name: string;
    template: { id: string; name: string };
}

interface ChecklistItem {
    id: string;
    itemNameSnapshot: string;
    sortOrder: number;
    isActive: boolean;
    isComplete: boolean;
    lastChangedAt: string | null;
    lastChangedBy: { id: string; displayName: string } | null;
}

interface Checklist {
    id: string;
    roomId: string;
    wibDate: string;
    roomNameSnapshot: string;
    items: ChecklistItem[];
    derivedStatus: "SELESAI" | "BELUM";
}

export default function CleaningPage() {
    const toast = useToast();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [checklist, setChecklist] = useState<Checklist | null>(null);
    const [loading, setLoading] = useState(true);
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [updatingItem, setUpdatingItem] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch assigned rooms
    const fetchRooms = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/cleaning/rooms");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat ruangan."));
            const json = await res.json();
            setRooms(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat ruangan.";
            setError(msg);
            reportClientError("CleaningPage", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchRooms(); }, [fetchRooms]);

    // Open or create today's checklist for a room
    const openChecklist = useCallback(async (room: Room) => {
        setSelectedRoom(room);
        setChecklistLoading(true);
        setChecklist(null);
        setError(null);
        try {
            const res = await fetch("/api/cleaning/checklists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId: room.id }),
            });
            if (!res.ok) {
                const json = await res.json();
                if (json.error === "ROOM_NOT_READY") {
                    setError("Ruangan ini belum memiliki template atau item aktif. Hubungi WIG002.");
                    return;
                }
                throw new Error(json.error || "Gagal membuka checklist.");
            }
            const json = await res.json();
            setChecklist(json.data);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal membuka checklist.";
            setError(msg);
            reportClientError("CleaningPage", msg, err);
        } finally {
            setChecklistLoading(false);
        }
    }, []);

    // Toggle item completion
    const toggleItem = useCallback(async (item: ChecklistItem) => {
        if (updatingItem) return;
        setUpdatingItem(item.id);
        const previousComplete = item.isComplete;

        const rollback = () => {
            setChecklist((prev) => {
                if (!prev) return prev;
                const items = prev.items.map((i) =>
                    i.id === item.id ? { ...i, isComplete: previousComplete } : i
                );
                const activeItems = items.filter((i) => i.isActive);
                const derivedStatus = activeItems.length > 0 && activeItems.every((i) => i.isComplete) ? "SELESAI" as const : "BELUM" as const;
                return { ...prev, items, derivedStatus };
            });
        };

        // Optimistic update
        setChecklist((prev) => {
            if (!prev) return prev;
            const items = prev.items.map((i) =>
                i.id === item.id ? { ...i, isComplete: !previousComplete } : i
            );
            const activeItems = items.filter((i) => i.isActive);
            const derivedStatus = activeItems.length > 0 && activeItems.every((i) => i.isComplete) ? "SELESAI" as const : "BELUM" as const;
            return { ...prev, items, derivedStatus };
        });

        try {
            const res = await fetch(`/api/cleaning/checklist-items/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isComplete: !previousComplete }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan."));
            }
            const json = await res.json();
            // Update with confirmed server data
            setChecklist((prev) => {
                if (!prev) return prev;
                const items = prev.items.map((i) =>
                    i.id === item.id ? json.data.item : i
                );
                return { ...prev, items, derivedStatus: json.data.derivedStatus };
            });
        } catch (err) {
            rollback();
            const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
            toast(msg, "error");
            reportClientError("CleaningPage", msg, err);
        } finally {
            setUpdatingItem(null);
        }
    }, [updatingItem, toast]);

    // Back to room list
    const backToRooms = useCallback(() => {
        setSelectedRoom(null);
        setChecklist(null);
        setError(null);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Checklist view
    if (selectedRoom) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6">
                <button
                    onClick={backToRooms}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1"
                >
                    ← Kembali ke daftar ruangan
                </button>

                <div className="bg-card border border-border rounded-lg p-4 mb-4">
                    <h1 className="text-xl font-semibold text-foreground">{selectedRoom.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Template: {selectedRoom.template.name}
                    </p>
                    {checklist && (
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
                                checklist.derivedStatus === "SELESAI"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            }`}>
                                {checklist.derivedStatus === "SELESAI" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                    <Circle className="h-3.5 w-3.5" />
                                )}
                                {checklist.derivedStatus}
                            </span>
                            <span className="text-xs text-muted-foreground">{checklist.wibDate}</span>
                        </div>
                    )}
                </div>

                {checklistLoading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {error && !checklistLoading && (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                        <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
                        <p className="text-sm text-destructive">{error}</p>
                        <button
                            onClick={() => openChecklist(selectedRoom)}
                            className="mt-3 text-sm text-primary hover:underline inline-flex items-center gap-1"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
                        </button>
                    </div>
                )}

                {checklist && !checklistLoading && (
                    <div className="space-y-2">
                        {checklist.items.filter((i) => i.isActive).map((item) => (
                            <button
                                key={item.id}
                                onClick={() => toggleItem(item)}
                                disabled={updatingItem === item.id}
                                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                                    item.isComplete
                                        ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                                        : "bg-card border-border hover:bg-accent/50"
                                } ${updatingItem === item.id ? "opacity-50" : ""}`}
                            >
                                <div className="mt-0.5 flex-shrink-0">
                                    {updatingItem === item.id ? (
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    ) : item.isComplete ? (
                                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                    ) : (
                                        <Circle className="h-5 w-5 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium ${
                                        item.isComplete ? "text-green-800 dark:text-green-300 line-through" : "text-foreground"
                                    }`}>
                                        {item.itemNameSnapshot}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {item.lastChangedBy
                                            ? `${item.lastChangedBy.displayName} · ${formatTime(item.lastChangedAt)}`
                                            : "Belum diubah"}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Room list view
    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Checklist Inspeksi</h1>
            <p className="text-sm text-muted-foreground mb-6">
                Pilih ruangan untuk membuka checklist hari ini.
            </p>

            {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center mb-4">
                    <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            {rooms.length === 0 && !error && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Anda belum ditugaskan ke ruangan manapun.</p>
                    <p className="text-sm text-muted-foreground mt-1">Hubungi WIG002 untuk penugasan.</p>
                </div>
            )}

            <div className="space-y-3">
                {rooms.map((room) => (
                    <button
                        key={room.id}
                        onClick={() => openChecklist(room)}
                        className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-accent/50 transition-colors text-left"
                    >
                        <div>
                            <p className="font-medium text-foreground">{room.name}</p>
                            <p className="text-sm text-muted-foreground">{room.template.name}</p>
                        </div>
                        <span className="text-muted-foreground">→</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function formatTime(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jakarta",
        });
    } catch {
        return "";
    }
}
