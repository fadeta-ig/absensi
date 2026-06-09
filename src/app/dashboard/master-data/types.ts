export interface Department {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    divisionId: string;
    isActive: boolean;
    division: { name: string };
}

export interface Division {
    id: string;
    name: string;
    isActive: boolean;
    _count?: { departments: number };
}

export interface Position {
    id: string;
    name: string;
    isActive: boolean;
}

export interface Location {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    isActive: boolean;
}

export type Tab = "departments" | "divisions" | "positions" | "locations";
