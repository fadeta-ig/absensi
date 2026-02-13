"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User, Lock, LogIn, Loader2, KeyRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isSubmitting = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, password }),
        credentials: "same-origin",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login gagal");
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      // Small delay to ensure cookie is properly set before navigation
      await new Promise((r) => setTimeout(r, 200));

      if (data.role === "hr") {
        router.push("/dashboard");
      } else {
        router.push("/employee");
      }
    } catch {
      setError("Terjadi kesalahan koneksi");
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF5F7] via-white to-[#FFF0F0] relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-[-120px] right-[-80px] w-[300px] h-[300px] bg-[var(--primary)]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-100px] left-[-60px] w-[250px] h-[250px] bg-[var(--primary)]/8 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[var(--primary)]/3 rounded-full blur-[128px]" />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="bg-white rounded-2xl shadow-lg border border-[var(--border)] p-8 md:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 relative mb-4">
              <Image
                src="/assets/Logo WIG.png"
                alt="WIG Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">WIG Attendance</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">PT Wijaya Inovasi Gemilang</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                <span className="text-red-500">!</span>
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="employeeId" className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                ID Karyawan
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  id="employeeId"
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Contoh: WIG001"
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 transition-all duration-200"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 transition-all duration-200"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-light,#9B1B30)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Masuk
                </>
              )}
            </button>

            <div className="mt-5 p-3 bg-[var(--secondary)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Informasi Login</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Hubungi <strong className="text-[var(--text-secondary)]">HR</strong> untuk mendapatkan password akun Anda via email.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
