"use client";

import { useEffect, useState } from "react";
import { NotebookPen, Plus, Trash2, CheckCircle, Circle, Loader2 } from "lucide-react";

interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: string;
}

export default function TodosPage() {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [newTodo, setNewTodo] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/todos").then((r) => r.json()).then(setTodos);
    }, []);

    const addTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTodo.trim()) return;
        setLoading(true);
        const res = await fetch("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: newTodo }),
        });
        if (res.ok) {
            const todo = await res.json();
            setTodos((prev) => [todo, ...prev]);
            setNewTodo("");
        }
        setLoading(false);
    };

    const toggleTodo = async (id: string, completed: boolean) => {
        const res = await fetch("/api/todos", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, completed: !completed }),
        });
        if (res.ok) setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    };

    const deleteTodo = async (id: string) => {
        const res = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
        if (res.ok) setTodos((prev) => prev.filter((t) => t.id !== id));
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
                {todos.length === 0 ? (
                    <div className="card p-8 text-center">
                        <NotebookPen className="w-10 h-10 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada catatan</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Tambahkan tugas harian Anda di atas</p>
                    </div>
                ) : (
                    todos.map((todo) => (
                        <div key={todo.id} className={`card px-4 py-3 flex items-center gap-3 group transition-opacity ${todo.completed ? "opacity-60" : ""}`}>
                            <button onClick={() => toggleTodo(todo.id, todo.completed)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
                                {todo.completed ? <CheckCircle className="w-5 h-5 text-[var(--primary)]" /> : <Circle className="w-5 h-5" />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm ${todo.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{todo.text}</p>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                    {new Date(todo.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                </p>
                            </div>
                            <button onClick={() => deleteTodo(todo.id)} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
