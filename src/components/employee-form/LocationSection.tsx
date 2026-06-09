import { Check, MapPin } from "lucide-react";
import { Location, FormState } from "./types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
    masterLocations: Location[];
    toggleLocation: (loc: Location) => void;
}

export function LocationSection({ form, setForm, masterLocations, toggleLocation }: Props) {
    return (
        <div className="card p-6 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-orange-600" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Lokasi Absensi</h2>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.bypassLocation} onChange={(e) => setForm({ ...form, bypassLocation: e.target.checked })} className="w-3.5 h-3.5 rounded text-orange-600" />
                    <span className="text-xs font-semibold text-orange-700">Bypass</span>
                </label>
            </div>

            {!form.bypassLocation && (
                <div className="space-y-3">
                    <p className="text-[10px] text-[var(--text-muted)] italic leading-relaxed">Pilih satu atau beberapa lokasi kerja untuk karyawan ini.</p>
                    <div className="grid grid-cols-1 gap-2">
                        {masterLocations.map(loc => {
                            const isSelected = form.locations.some((l: Location) => l.id === loc.id);
                            return (
                                <button
                                    key={loc.id}
                                    type="button"
                                    onClick={() => toggleLocation(loc)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${isSelected ? "border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--text-primary)]" : "border-[var(--border)] hover:border-[var(--border)] text-[var(--text-secondary)]"}`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-[var(--primary)] border-[var(--primary)] text-white" : "border-[var(--border)]"}`}>
                                        {isSelected && <Check className="w-2.5 h-2.5" />}
                                    </div>
                                    <span className="text-xs font-medium">{loc.name}</span>
                                </button>
                            );
                        })}
                        {masterLocations.length === 0 && (
                            <p className="text-xs text-red-500 font-medium py-2">Belum ada data lokasi di Master Data.</p>
                        )}
                    </div>
                </div>
            )}
            {form.bypassLocation && (
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 text-center">
                    <p className="text-xs text-orange-800 font-medium">Bypass aktif: Karyawan dapat absen dari mana saja.</p>
                </div>
            )}
        </div>
    );
}
