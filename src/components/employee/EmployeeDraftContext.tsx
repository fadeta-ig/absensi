"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { buildOwnerScope, syncActiveDraftOwner } from "@/lib/formPersistence";

interface EmployeeDraftContextValue {
    ownerScope: string | null;
}

const EmployeeDraftContext = createContext<EmployeeDraftContextValue>({
    ownerScope: null,
});

interface EmployeeDraftProviderProps {
    userId?: string | null;
    employeeId?: string | null;
    children: React.ReactNode;
}

/**
 * Provides authenticated owner scoping for Employee Portal form drafts.
 * Shared components rendered outside this provider (e.g. GA/HR portals)
 * read `null` and cleanly disable Employee Portal draft persistence.
 */
export function EmployeeDraftProvider({
    userId,
    employeeId,
    children,
}: EmployeeDraftProviderProps) {
    const ownerScope = useMemo(
        () => buildOwnerScope(userId, employeeId),
        [userId, employeeId]
    );

    useEffect(() => {
        if (ownerScope) {
            syncActiveDraftOwner(ownerScope);
        }
    }, [ownerScope]);

    const value = useMemo(() => ({ ownerScope }), [ownerScope]);

    return (
        <EmployeeDraftContext.Provider value={value}>
            {children}
        </EmployeeDraftContext.Provider>
    );
}

/** Returns the current Employee Portal draft owner scope, or `null` outside the portal. */
export function useEmployeeDraftOwner(): string | null {
    return useContext(EmployeeDraftContext).ownerScope;
}
