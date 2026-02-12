import { Event, YearlyBalance } from './types';

export const MONTHS: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const DAYS: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const EVENT_TYPES: string[] = ['OVERTIME', 'TOIL', 'PAID', 'SICK', 'BEREAVEMENT', 'MARRIAGE', 'ONCALL'];

export const SHORT: Record<string, string> = { OVERTIME: 'OT', TOIL: 'TL', PAID: 'PL', SICK: 'SL', BEREAVEMENT: 'BL', MARRIAGE: 'ML', ONCALL: 'OC' };

export const YEARS: number[] = [2025, 2026];
export const LOCKED_YEARS: number[] = [2025];

export const ALL_FILTERS = new Set([
    'OVERTIME|Earned',
    'TOIL|Taken', 'TOIL|Planned',
    'PAID|Taken', 'PAID|Planned',
    'SICK|Taken', 'SICK|Planned',
    'BEREAVEMENT|Taken',
    'MARRIAGE|Taken', 'MARRIAGE|Planned',
    'ONCALL|Done', 'ONCALL|Planned'
]);

// Utility to round numbers to 2 decimal places to avoid float errors
export const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

export const formatHours = (num: number) => {
    if (!num) return '-';
    return round2(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Calculates duration in hours between two HH:MM:SS time strings.
 * Handles overnight shifts (crossing midnight).
 */
export const calcDuration = (start: string, finish: string): number => {
    if (!start || !finish) return 0;
    const [h1, m1, s1 = 0] = start.split(':').map(Number);
    const [h2, m2, s2 = 0] = finish.split(':').map(Number);

    // Create dates with explicit seconds
    const d1 = new Date(0, 0, 0, h1, m1, s1);
    const d2 = new Date(0, 0, 0, h2, m2, s2);

    let diffMs = d2.getTime() - d1.getTime();
    if (diffMs < 0) diffMs += 24 * 3600 * 1000; // Add 24 hours in ms

    const diffHours = diffMs / 36e5;
    return round2(diffHours);
};

/**
 * Calculates duration string "HH:mm:ss" between two HH:mm:ss strings.
 */
export const calcDurationTime = (start: string, finish: string): string => {
    if (!start || !finish) return '00:00:00';
    const [h1, m1, s1 = 0] = start.split(':').map(Number);
    const [h2, m2, s2 = 0] = finish.split(':').map(Number);

    const d1 = new Date(0, 0, 0, h1, m1, s1);
    const d2 = new Date(0, 0, 0, h2, m2, s2);

    let diffMs = d2.getTime() - d1.getTime();
    if (diffMs < 0) diffMs += 24 * 3600 * 1000;

    const h = Math.floor(diffMs / 3600000);
    diffMs %= 3600000;
    const m = Math.floor(diffMs / 60000);
    diffMs %= 60000;
    const s = Math.round(diffMs / 1000);

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Helper to consistently derive type from row data
export const getDerivedType = (row: Event): string => {
    return row.type;
};

// Determines the CSS class for event styling based on Type and Status
export const getEventColorClass = (type: string, status: string, forRow: boolean = false): string => {
    const suffix = forRow ? '' : '-bg';
    const prefix = forRow ? 'row-' : '';

    if (type === 'PAID') {
        if (status === 'Planned') return `${prefix}paid-planned${suffix}`;
        return `${prefix}paid-taken${suffix}`;
    }
    if (type === 'TOIL') {
        if (status === 'Planned') return `${prefix}toil-planned${suffix}`;
        return `${prefix}toil-taken${suffix}`;
    }
    if (type === 'SICK') {
        if (status === 'Planned') return `${prefix}sick-planned${suffix}`;
        return `${prefix}sick${suffix}`;
    }
    if (type === 'BEREAVEMENT') {
        return `${prefix}bereavement${suffix}`;
    }
    if (type === 'MARRIAGE') {
        if (status === 'Planned') return `${prefix}marriage-planned${suffix}`;
        return `${prefix}marriage${suffix}`;
    }
    if (type === 'ONCALL') {
        if (status === 'Planned') return `${prefix}oncall-planned${suffix}`;
        return `${prefix}oncall-done${suffix}`;
    }
    if (type === 'OVERTIME') return `${prefix}overtime${suffix}`;
    return '';
};

export const deriveStatus = (type: string, dateStr: string, finishTimeStr: string): string => {
    if (!type || !dateStr) return '';

    // Date Comparison logic
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const isPast = dateStr < todayStr;
    // const isFuture = dateStr > todayStr; // Unused

    // For Today, check time
    let isTimePast = false;
    if (dateStr === todayStr && finishTimeStr) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [h, min] = finishTimeStr.split(':').map(Number);
        const finishMinutes = h * 60 + min;
        isTimePast = finishMinutes <= currentMinutes;
    }
    const isPastOrDoneToday = isPast || (dateStr === todayStr && isTimePast);

    if (type === 'OVERTIME') {
        // "Overtime (past only) --> Earned"
        // Future Overtime is typically restricted by validation, but if it exists, what status? 
        // Assuming strictly Earned for past, and maybe empty or Planned for future?
        // User request says: "Overtime (past only) --> Earned"
        // Implicitly, future OT might be invalid or 'Planned'. But usually OT is 'Earned'.
        // Let's stick to Earned if past/done.
        if (isPastOrDoneToday) return 'Earned';
        return 'Planned'; // Or 'Pending'? Defaulting to Planned/Earned based on context. 
        // Actually, existing logic just returned 'Earned' always. 
        // Let's return 'Earned' if past, 'Planned' if future to align with other logic, unless strictly specified.
        // Re-reading: "Overtime (past only) --> Earned". 
        // Since I added validation to prevent Future OT for non-managers, this is mostly for managers.
        // I'll return 'Earned' if past, 'Planned' if future.
    }

    if (['TOIL', 'PAID', 'MARRIAGE'].includes(type)) {
        // "TOIL, Paid, Marriage --> Taken (if past) or Planned (if future)"
        return isPastOrDoneToday ? 'Taken' : 'Planned';
    }

    if (['SICK', 'SICK CERTIFIED'].includes(type) || type === 'SICK') { // Handle both if SICK CERTIFIED exists
        // "Sick (Past only) ---> Taken"
        return 'Taken'; // Validation prevents future Sick.
    }

    if (type === 'BEREAVEMENT') {
        // "Bereavement ---> Taken"
        return 'Taken';
    }

    if (type === 'ONCALL') {
        // "Oncall ---> Done (if past) Planned (if future)"
        return isPastOrDoneToday ? 'Done' : 'Planned';
    }

    return 'Planned'; // Default
};

// --- DATA ACCESS & CALCULATION HELPERS ---

export const getBalanceValue = (yearlyData: YearlyBalance[], emp: string, y: number, type: string) => {
    // yearlyData is now holding rows from yearly_balances (id, employee_name, year, type, value)
    const row = yearlyData.find(d =>
        d.employee_name === emp &&
        String(d.year) === String(y) &&
        d.type.toLowerCase() === type.toLowerCase()
    );
    return row ? row.value : 0;
};

export const getSum = (events: Event[], emp: string, y: number, type: string, status: string) => {
    return events.filter(ev => {
        if (ev.situation && ['Added', 'Updated', 'Deleted'].includes(ev.situation)) return false;
        const [yStr] = (ev.date || '').split('-');
        if (Number(yStr || 0) !== y) return false;
        if (ev.employee_name !== emp) return false;

        const eType = getDerivedType(ev);
        const eStatus = deriveStatus(eType, ev.date, ev.finish_time);
        // Match Logic
        return eType === type && (ev.status || eStatus) === status;
    }).reduce((acc, ev) => acc + (ev.duration_hour || 0), 0);
};

export const getOtCarryOver = (events: Event[], yearlyData: YearlyBalance[], emp: string, y: number): number | string => {
    if (y === 2025) {
        const val = getBalanceValue(yearlyData, emp, y, 'Overtime Carryover');
        return val !== 0 ? val : '-';
    }
    // For 2026, it is 2025's remaining
    return calcOtRemaining(events, yearlyData, emp, y - 1);
};

export const calcOtRemaining = (events: Event[], yearlyData: YearlyBalance[], emp: string, y: number): number => {
    const carryOver = getOtCarryOver(events, yearlyData, emp, y); // number | '-'
    const earned = getSum(events, emp, y, 'OVERTIME', 'Earned');
    const taken = getSum(events, emp, y, 'TOIL', 'Taken');
    const planned = getSum(events, emp, y, 'TOIL', 'Planned');

    // If Carry Over is '-', treat as 0 for calc
    const coVal = typeof carryOver === 'string' ? 0 : carryOver;
    return coVal + earned - taken - planned;
};

export const getPaidCarryOver = (events: Event[], yearlyData: YearlyBalance[], emp: string, y: number): number => {
    if (y === 2025) return getBalanceValue(yearlyData, emp, y, 'carryover');
    return calcPaidRemaining(events, yearlyData, emp, y - 1);
};

export const calcPaidRemaining = (events: Event[], yearlyData: YearlyBalance[], emp: string, y: number): number => {
    const carryOver = getPaidCarryOver(events, yearlyData, emp, y);
    const entitled = getBalanceValue(yearlyData, emp, y, 'entitlement');
    const adjustment = getBalanceValue(yearlyData, emp, y, 'adjustment');
    const taken = getSum(events, emp, y, 'PAID', 'Taken');
    const planned = getSum(events, emp, y, 'PAID', 'Planned');

    return carryOver + entitled + adjustment - taken - planned;
};

// Helper for Employee Name Formatting: "First_Piece Last_Piece"
export const formatEmployeeName = (fullName: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first} ${last}`;
};
