export interface Event {
    id: number | string;
    employee_id?: number | null;
    employee_name: string;
    type: string;
    date: string; // YYYY-MM-DD
    start_time: string; // HH:mm:ss
    finish_time: string; // HH:mm:ss
    duration_time?: string; // HH:mm:ss - Optional for new events
    duration_hour: number;
    comment: string | null;
    situation: 'Added' | 'Updated' | 'Deleted' | 'Approved' | 'Rejected' | null;
    status: string; // 'Earned', 'Taken', 'Planned'
    original_data?: string | null; // JSON string
    isNew?: boolean; // Frontend only flag
    recurrence_id?: number | null;
}

export interface Holiday {
    date: string;
    description: string;
    type: string;
}

export interface YearlyBalance {
    id: number;
    employee_id: number;
    employee_name?: string;
    year: string;
    type: string;
    value: number;
}

export interface Employee {
    id: number;
    name: string;
    email: string;
    manager_id: number | null;
    department: string | null;
    mobile_phone: string | null;
}

export interface User {
    name: string;
    email: string;
    employee_id?: number | null;
    is_manager?: boolean;
    manages?: string[]; // List of names
    managed_ids?: number[]; // List of IDs (New from Backend)
    is_admin?: boolean; // Only for specific users (Weslley)
}
