"use client";

import { useEffect, useState } from "react";
import { AlertCircle, NotebookPen, Plus, Trash2, CheckCircle, Circle, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: string;
}

export default function TodosPage() {
    const toast = useToast();
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [newTodo, setNewTodo] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        const loadTodos = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/todos");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat catatan."));
                const data = await res.json();
                setTodos(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("TodosPage", "Gagal memuat catatan", error);
                const message = error instanceof Error ? error.message : "Gagal memuat catatan.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadTodos();
    }, [toast]);

    const addTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTodo.trim()) return;
        setLoading(true);
        try {
            const res = await fetch("/api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: newTodo }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambahkan catatan."));
            const todo = await res.json();
            setTodos((prev) => [todo, ...prev]);
            setNewTodo("");
            toast("Catatan berhasil ditambahkan.", "success");
        } catch (error) {
            reportClientError("TodosPage", "Gagal menambahkan catatan", error);
            toast(error instanceof Error ? error.message : "Gagal menambahkan catatan.", "error");
        } finally {
            setLoading(false);
        }
    };

    const toggleTodo = async (id: string, completed: boolean) => {
        setBusyId(id);
        try {
            const res = await fetch("/api/todos", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, completed: !completed }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status catatan."));
            setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
        } catch (error) {
            reportClientError("TodosPage", "Gagal mengubah status catatan", error, { todoId: id });
            toast(error instanceof Error ? error.message : "Gagal mengubah status catatan.", "error");
        } finally {
            setBusyId(null);
        }
    };

    const deleteTodo = async (id: string) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus catatan."));
            setTodos((prev) => prev.filter((t) => t.id !== id));
            toast("Catatan berhasil dihapus.", "success");
        } catch (error) {
            reportClientError("TodosPage", "Gagal menghapus catatan", error, { todoId: id });
            toast(error instanceof Error ? error.message : "Gagal menghapus catatan.", "error");
        } finally {
            setBusyId(null);
        }
    };

    const completedCount = todos.filter((t) => t.completed).length;
    const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <NotebookPen className="w-5 h-5 text-[var(--primary)]" />
                    Catatan & To-Do
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Kelola tugas harian Anda</p>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Progress */}
            {todos.length > 0 && (
                <div className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[var(--text-secondary)]">{completedCount} dari {todos.length} selesai</span>
                        <span className="text-sm font-bold text-[var(--primary)]">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--primary)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {/* Add */}
            <form onSubmit={addTodo} className="flex gap-2">
                <input
                    type="text"
                    className="form-input flex-1"
                    placeholder="Tambahkan tugas baru..."
                    value={newTodo}
                    onChange={(e) => setNewTodo(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={!newTodo.trim() || loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span className="hidden sm:inline">Tambah</span>
                </button>
            </form>

            {/* List */}
            <div className="space-y-2">
                {initialLoading ? (
                    <div className="card p-8 text-center text-[var(--text-muted)]">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-50" />
                        <p className="text-sm font-medium">Memuat catatan...</p>
                    </div>
                ) : todos.length === 0 ? (
                    <div className="card p-8 text-center">
                        <NotebookPen className="w-10 h-10 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada catatan</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Tambahkan tugas harian Anda di atas</p>
                    </div>
                ) : (
                    todos.map((todo) => (
                        <div key={todo.id} className={`card px-4 py-3 flex items-center gap-3 group transition-opacity ${todo.completed ? "opacity-60" : ""}`}>
                            <button onClick={() => toggleTodo(todo.id, todo.completed)} disabled={busyId === todo.id} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors disabled:opacity-50">
                                {busyId === todo.id ? <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" /> : todo.completed ? <CheckCircle className="w-5 h-5 text-[var(--primary)]" /> : <Circle className="w-5 h-5" />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm ${todo.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{todo.text}</p>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                    {new Date(todo.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                </p>
                            </div>
                            <button onClick={() => deleteTodo(todo.id)} disabled={busyId === todo.id} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all disabled:opacity-50">
                                {busyId === todo.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
