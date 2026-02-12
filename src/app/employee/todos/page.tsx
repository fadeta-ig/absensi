"use client";

import { useEffect, useState } from "react";
import styles from "./todos.module.css";

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

        if (res.ok) {
            setTodos((prev) =>
                prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
            );
        }
    };

    const deleteTodo = async (id: string) => {
        const res = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
        if (res.ok) {
            setTodos((prev) => prev.filter((t) => t.id !== id));
        }
    };

    const completedCount = todos.filter((t) => t.completed).length;
    const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>📝 Catatan & To-Do</h1>
                <p className={styles.subtitle}>Kelola tugas harian Anda</p>
            </div>

            {/* Progress */}
            {todos.length > 0 && (
                <div className={`glass-card ${styles.progressCard}`}>
                    <div className={styles.progressHeader}>
                        <span className={styles.progressLabel}>
                            {completedCount} dari {todos.length} selesai
                        </span>
                        <span className={styles.progressPercent}>{Math.round(progress)}%</span>
                    </div>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Add Todo */}
            <form className={styles.addForm} onSubmit={addTodo}>
                <input
                    type="text"
                    className={`form-input ${styles.addInput}`}
                    placeholder="Tambahkan tugas baru..."
                    value={newTodo}
                    onChange={(e) => setNewTodo(e.target.value)}
                />
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!newTodo.trim() || loading}
                >
                    {loading ? "..." : "+ Tambah"}
                </button>
            </form>

            {/* Todo List */}
            <div className={styles.todoList}>
                {todos.length === 0 ? (
                    <div className="glass-card empty-state">
                        <span className="empty-state-icon">📝</span>
                        <p className="empty-state-title">Belum ada catatan</p>
                        <p className="empty-state-text">Tambahkan tugas harian Anda di atas</p>
                    </div>
                ) : (
                    todos.map((todo) => (
                        <div
                            key={todo.id}
                            className={`glass-card ${styles.todoItem} ${todo.completed ? styles.todoCompleted : ""}`}
                        >
                            <button
                                className={`${styles.checkbox} ${todo.completed ? styles.checked : ""}`}
                                onClick={() => toggleTodo(todo.id, todo.completed)}
                            >
                                {todo.completed && "✓"}
                            </button>
                            <div className={styles.todoContent}>
                                <p className={styles.todoText}>{todo.text}</p>
                                <p className={styles.todoDate}>
                                    {new Date(todo.createdAt).toLocaleDateString("id-ID", {
                                        day: "numeric",
                                        month: "short",
                                    })}
                                </p>
                            </div>
                            <button
                                className={styles.deleteBtn}
                                onClick={() => deleteTodo(todo.id)}
                            >
                                🗑️
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
