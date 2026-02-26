"use client";

import { useEffect, useState } from "react";
import { Users, Search, ChevronRight, Activity, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
    position: string;
    level: string;
    isActive: boolean;
}

export default function MonitoringPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/employees")
            .then((r) => r.json())
            .then((data) => {
                setEmployees(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Monitoring Tim</h1>
                    <p className="text-muted-foreground">Monitoring performa dan aktivitas anggota tim Anda secara real-time.</p>
                </div>
                <Activity className="h-8 w-8 text-emerald-500" />
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
                    placeholder="Cari anggota tim..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.length > 0 ? filtered.map((e) => (
                    <Card key={e.id} className="hover:shadow-md transition-shadow border-l-4 border-l-emerald-500">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                                        {e.name.charAt(0)}
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">{e.name}</CardTitle>
                                        <p className="text-xs text-muted-foreground">{e.position}</p>
                                    </div>
                                </div>
                                <Badge variant={e.isActive ? "success" : "destructive"} className="text-[10px]">
                                    {e.isActive ? "Active" : "Inactive"}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 mt-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground text-xs">Department</span>
                                    <span className="font-medium text-xs">{e.department}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground text-xs">Level</span>
                                    <span className="font-medium text-xs">{e.level}</span>
                                </div>
                                <div className="pt-3 border-t">
                                    <Link
                                        href={`/employee/monitoring/${e.id}`}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors text-xs font-semibold"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        Lihat Profil 360°
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )) : (
                    <div className="col-span-full py-12 text-center text-muted-foreground bg-gray-50 rounded-lg border-2 border-dashed">
                        Tidak ada anggota tim yang ditemukan.
                    </div>
                )}
            </div>
        </div>
    );
}
