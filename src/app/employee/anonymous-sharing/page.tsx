"use client";

import { MessageSquareHeart } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import AnonymousShareForm from "@/components/employee/AnonymousShareForm";

export default function EmployeeAnonymousSharingPage() {
    return (
        <div className="w-full max-w-xl mx-auto space-y-5">
            <PageHeader
                icon={MessageSquareHeart}
                title="Ruang Sharing Anonim"
                subtitle="Sampaikan cerita, kendala kerja, atau saran ke tim HR tanpa identitas pengirim."
            />

            <div className="emp-surface p-5">
                <AnonymousShareForm formId="employee-page-anon-form" />
            </div>
        </div>
    );
}
