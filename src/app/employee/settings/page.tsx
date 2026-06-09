"use client";

import { Settings } from "lucide-react";
import { FaceRegistrationCard } from "./components/FaceRegistrationCard";
import { ChangePasswordCard } from "./components/ChangePasswordCard";

export default function SettingsPage() {
    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[var(--primary)]" />
                    Pengaturan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Kelola akun dan keamanan Anda</p>
            </div>

            {/* ═══ Face Registration Card ═══ */}
            <FaceRegistrationCard />

            {/* ═══ Change Password Card ═══ */}
            <ChangePasswordCard />
        </div>
    );
}
