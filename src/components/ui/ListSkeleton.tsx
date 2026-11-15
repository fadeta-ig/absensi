import { Skeleton } from "@/components/ui/Skeleton";

type ListSkeletonProps = {
    count?: number;
    rows?: 1 | 2 | 3;
    label?: string;
    className?: string;
};

/** Placeholder daftar kartu; bentuknya mengikuti kartu hasil, bukan spinner generik. */
export default function ListSkeleton({
    count = 3,
    rows = 3,
    label = "Memuat data",
    className = "",
}: ListSkeletonProps) {
    return (
        <div className={`space-y-3 ${className}`} role="status" aria-live="polite" aria-label={label}>
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="emp-surface space-y-2 p-4">
                    <Skeleton className="h-5 w-2/3" />
                    {rows > 1 && <Skeleton className="h-4 w-1/2" />}
                    {rows > 2 && <Skeleton className="h-3 w-1/3" />}
                </div>
            ))}
        </div>
    );
}
