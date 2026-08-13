"use client";

import { useEffect } from "react";

/**
 * React Hook to prevent accidental refresh / navigation away when a form has unsaved changes.
 * @param isDirty boolean indicating if the form contains modified unsaved data
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required for modern browsers to trigger the native confirmation dialog
      const message = "Ada perubahan data yang belum disimpan. Yakin ingin keluar/refresh?";
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);
}
