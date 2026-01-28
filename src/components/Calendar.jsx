import React, { useState, useEffect, useMemo } from 'react';
import './Calendar.css';


const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EVENT_TYPES = ['OVERTIME', 'TOIL', 'PAID', 'SICK', 'MARRIAGE', 'ONCALL'];

// Helper to consistently derive type from row data
// Used for filtering and coloring logic
const getDerivedType = (row) => {
    return row.type;
};

// Determines the CSS class for event styling based on Type and Status
// Supports both background (-bg) and full row styling
const getEventColorClass = (type, status, forRow = false) => {
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

const EVENT_CLASS_MAP = {
    'OVERTIME': 'overtime',
    'TOIL': 'toil',
    'PAID': 'paid',
    'SICK': 'sick',
    'MARRIAGE': 'marriage',
    'ONCALL': 'oncall'
};

const SHORT = { OVERTIME: 'OT', TOIL: 'TL', PAID: 'PL', SICK: 'SL', MARRIAGE: 'ML', ONCALL: 'OC' };
const YEARS = [2025, 2026]; // Supported Years

// Utility to round numbers to 2 decimal places to avoid float errors
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function Calendar({ currentUser }) {
    // -------------------------------------------------------------------------
    // STATE MANAGEMENT
    // -------------------------------------------------------------------------
    const LOCKED_YEARS = [2025];
    const [viewType, setViewType] = useState('MONTHLY');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [currentDate, setCurrentDate] = useState(new Date(selectedYear, new Date().getMonth(), 1));
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const [events, setEvents] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState(new Set());
    // Initial Filters: All Combinations
    const ALL_FILTERS = new Set([
        'OVERTIME|Earned',
        'TOIL|Taken', 'TOIL|Planned',
        'PAID|Taken', 'PAID|Planned',
        'SICK|Taken', 'SICK|Planned',
        'MARRIAGE|Taken', 'MARRIAGE|Planned',
        'ONCALL|Done', 'ONCALL|Planned'
    ]);
    const [selectedFilters, setSelectedFilters] = useState(new Set(ALL_FILTERS));
    const [allEmployeesChecked, setAllEmployeesChecked] = useState(false);
    const [holidays, setHolidays] = useState([]);

    const [otPrev, setOtPrev] = useState({});
    const [leavePrev, setLeavePrev] = useState({});
    const [leaveEntitled, setLeaveEntitled] = useState({});
    const [leaveAdjustment, setLeaveAdjustment] = useState({});

    // Grid State
    const [gridSelection, setGridSelection] = useState(new Set()); // IDs of checked rows
    const [editingRowIds, setEditingRowIds] = useState(new Set());
    const [editingEvents, setEditingEvents] = useState({}); // Staging area for edits
    const [dirtyRowIds, setDirtyRowIds] = useState(new Set()); // Rows that have been modified by user input
    const [newEvents, setNewEvents] = useState([]);
    const [yearlyData, setYearlyData] = useState([]);

    const STATUS_OPTIONS = ['Earned', 'Taken', 'Planned'];
    const isManager = currentUser === 'Weslley';

    // Derived Visible Employees for Totals Grids
    const visibleEmployees = useMemo(() => {
        if (isManager) return employees;
        return employees.filter(e => e.toLowerCase().includes(currentUser.toLowerCase()));
    }, [employees, isManager, currentUser]);

    const empColWidth = useMemo(() => {
        if (isManager) return 'minmax(0, 1fr)';
        if (visibleEmployees.length === 0) return '100px';
        // Approximate width: 9px per char + 45px padding/checkbox space
        // Using fixed px to ensure alignment across rows
        return `${Math.max(120, visibleEmployees[0].length * 9 + 45)}px`;
    }, [isManager, visibleEmployees]);

    // -------------------------------------------------------------------------
    // DATA FETCHING & INITIALIZATION
    // -------------------------------------------------------------------------
    // Fetch Data
    const fetchData = async () => {
        try {
            const [empRes, evtRes, yrRes, holRes] = await Promise.all([
                fetch('/api/employees'),
                fetch('/api/events'),
                fetch('/api/leave-data'),
                fetch('/api/holidays')
            ]);

            if (!empRes.ok) throw new Error(`Employees API Error: ${empRes.status}`);
            if (!evtRes.ok) throw new Error(`Events API Error: ${evtRes.status}`);

            const empData = await empRes.json();
            const evtData = await evtRes.json();

            if (empData && empData.data) {
                const names = empData.data;
                setEmployees(names);
                // Also select all initially? Or just me?
                // Default: Select ALL if Manager, else specific
                // Or let's imply default selection logic
                // For now, empty set means show none? Or show all?
                // Logic below implies manual selection.
                // Let's Auto-Select Current User if not Manager?
                if (!isManager) {
                    const me = names.find(n => n.toLowerCase().includes(currentUser.toLowerCase()));
                    if (me) setSelectedEmployees(new Set([me]));
                } else {
                    // Manager: Select All by default
                    setSelectedEmployees(new Set(names));
                    setAllEmployeesChecked(true);
                }
            }

            if (evtData && evtData.data) {
                setEvents(evtData.data);
            }
            if (yrRes.ok) {
                const yrJson = await yrRes.json();
                if (yrJson.data) {
                    console.log("DEBUG: Fetched Yearly Balances:", yrJson.data);
                    setYearlyData(yrJson.data);
                }
            }
            if (holRes.ok) {
                const holJson = await holRes.json();
                if (holJson.data) {
                    setHolidays(holJson.data);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchData();
        // Clear selection on load
        setGridSelection(new Set());
    }, []);

    // -------------------------------------------------------------------------
    // EVENT HANDLERS & LOGIC
    // -------------------------------------------------------------------------
    // Selection Handlers
    const toggleGridSelection = (id) => {
        const next = new Set(gridSelection);
        if (next.has(id)) next.delete(id); else next.add(id);
        setGridSelection(next);
    };

    /**
     * Calculates duration in hours between two HH:MM time strings.
     * Handles overnight shifts (crossing midnight).
     */
    const calcDuration = (start, finish) => {
        if (!start || !finish) return 0;
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = finish.split(':').map(Number);
        const d1 = new Date(0, 0, 0, h1, m1);
        const d2 = new Date(0, 0, 0, h2, m2);
        let diff = (d2 - d1) / 36e5;
        if (diff < 0) diff += 24;
        return round2(diff);
    };

    // Adds a new temporary event row for editing
    const handleAddEvent = () => {
        const newId = `temp-${Date.now()}`;
        const myName = employees.find(e => e.toLowerCase().includes(currentUser.toLowerCase())) || currentUser;

        const defaultDate = `${selectedYear}-${String(month + 1).padStart(2, '0')}-01`;
        const defaultType = 'TOIL';
        const defaultStart = '08:30';
        const defaultFinish = '16:30';

        const newEv = {
            id: newId,
            employee_name: isManager ? '' : myName,
            type: defaultType,
            status: deriveStatus(defaultType, defaultDate, defaultFinish),
            date: defaultDate,
            start_time: defaultStart,
            finish_time: defaultFinish,
            duration: calcDuration(defaultStart, defaultFinish),
            comment: '',
            situation: 'Added',
            isNew: true
        };

        // Add to newEvents list separately (bypasses filters)
        setNewEvents(prev => [...prev, newEv]);

        // Enter edit mode
        setEditingRowIds(prev => new Set(prev).add(newId));
        setEditingEvents(prev => ({ ...prev, [newId]: newEv }));
        // Mark as dirty so Commit/Cancel buttons are enabled
        setDirtyRowIds(prev => new Set(prev).add(newId));
    };

    const handleBatchUpdate = () => {
        // Enable edit mode for selected rows
        const newEditing = new Set(editingRowIds);
        const newEdits = { ...editingEvents };

        gridSelection.forEach(id => {
            if (!newEditing.has(id)) {
                const row = events.find(e => e.id === id);
                if (row) {
                    newEditing.add(id);
                    newEdits[id] = { ...row }; // Clone row data
                }
            }
        });
        setEditingRowIds(newEditing);
        setEditingEvents(newEdits);
    };

    const handleBatchDelete = () => {
        // Locked Year Check
        const hasLocked = Array.from(gridSelection).some(id => {
            const row = events.find(e => e.id === id);
            return row && LOCKED_YEARS.includes(parseInt(row.date.split('-')[0], 10));
        });
        if (hasLocked) {
            alert(`Cannot delete events from locked years (${LOCKED_YEARS.join(', ')}).`);
            return;
        }

        if (!confirm(`Are you sure you want to delete ${gridSelection.size} event(s)?`)) return;

        // Mark as Deleted or Hard Delete if "Added"
        const rowsToDelete = [];
        gridSelection.forEach(id => {
            const row = events.find(e => e.id === id);
            if (row) {
                // Always Soft Delete -> Situation: Deleted
                rowsToDelete.push({ ...row, situation: 'Deleted' });
            }
        });

        saveBatch(rowsToDelete).then(() => {
            setGridSelection(new Set());
        });
    };

    const performApprove = (ids) => {
        if (ids.length === 0) return;
        fetch('/api/approve-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        }).then(res => {
            if (res.ok) {
                fetchData();
                setGridSelection(new Set());
            }
        });
    };

    const handleBatchApprove = () => {
        const idsToApprove = [];
        gridSelection.forEach(id => {
            const row = events.find(e => e.id === id);
            if (row) idsToApprove.push(id);
        });
        performApprove(idsToApprove);
    };

    const performReject = (ids) => {
        if (ids.length === 0) return;
        fetch('/api/reject-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        })
            .then(async res => {
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({ error: 'Unknown server error' }));
                    throw new Error(errBody.error || 'Reject failed');
                }
                return res.json();
            })
            .then(() => {
                setGridSelection(new Set());
                fetchData();
            })
            .catch(err => alert("Error rejecting events: " + err.message));
    };

    const handleBatchReject = () => {
        if (!confirm(`Are you sure you want to REJECT ${gridSelection.size} event(s)?\n\n- Updated events will be REVERTED to their original state.\n- Added events will be DELETED.\n- Deleted events will be RESTORED.`)) return;
        const ids = Array.from(gridSelection);
        performReject(ids);
    };

    const handleRowApprove = (id) => {
        performApprove([id]);
    };

    const handleRowReject = (id) => {
        if (!confirm("Are you sure you want to reject this event?")) return;
        performReject([id]);
    };

    // Row Actions
    const deriveStatus = (type, dateStr, finishTimeStr) => {
        if (!type) return '';
        if (type === 'OVERTIME') return 'Earned';
        if (!dateStr) return '';

        // Robust Date Comparison (String based)
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        if (type === 'ONCALL') {
            return dateStr <= todayStr ? 'Done' : 'Planned';
        }

        if (dateStr < todayStr) return 'Taken';
        if (dateStr > todayStr) return 'Planned';

        // Same day: Check finish time against now
        if (finishTimeStr) {
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const [h, min] = finishTimeStr.split(':').map(Number);
            const finishMinutes = h * 60 + min;
            return finishMinutes <= currentMinutes ? 'Taken' : 'Planned';
        }

        return 'Planned';
    };

    const handleFieldChange = (id, field, value) => {
        setEditingEvents(prev => {
            const newEv = { ...prev[id], [field]: value };
            // Auto-calculate status if relevant fields change
            if (field === 'type' || field === 'date' || field === 'finish_time') {
                newEv.status = deriveStatus(newEv.type, newEv.date, newEv.finish_time);
            }
            if (field === 'start_time' || field === 'finish_time') {
                newEv.duration = calcDuration(newEv.start_time, newEv.finish_time);
            }
            return {
                ...prev,
                [id]: newEv
            };
        });
        setDirtyRowIds(prev => new Set(prev).add(id));
    };

    const handleTimeBlur = (id, field, value) => {
        // Validation on Blur: Finish Time > Start Time
        const row = editingEvents[id];
        let s = field === 'start_time' ? value : row.start_time;
        let f = field === 'finish_time' ? value : row.finish_time;

        if (s && f) {
            const [h1, m1] = s.split(':').map(Number);
            const [h2, m2] = f.split(':').map(Number);
            const t1 = h1 * 60 + m1;
            const t2 = h2 * 60 + m2;

            if (t2 <= t1) {
                alert("Finish time must be greater than Start time");
                // Revert to original committed value from 'events' array if possible, or Reset?
                // Best effort: Revert to the committed state of this row.
                const committedRow = events.find(e => e.id === id);
                let fallback = field === 'start_time' ? '08:30' : '16:30';
                if (committedRow) fallback = committedRow[field];

                // Force update state back to fallback
                handleFieldChange(id, field, fallback);
            }
        }
    };

    /**
     * Checks for overlapping events for the same employee.
     * Returns true if a conflict is found.
     */
    const checkOverlap = (ev) => {
        // Simple overlap check: Same Employee, Same Date, Time Overlap
        // (StartA < EndB) and (EndA > StartB)
        // Convert times to decimal hours for comparison
        const timeToDec = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h + m / 60;
        };

        const start = timeToDec(ev.start_time);
        const end = timeToDec(ev.finish_time);

        const conflicts = events.filter(other => {
            if (other.id === ev.id) return false; // Don't match self
            if (other.employee_name !== ev.employee_name) return false;
            if (other.date !== ev.date) return false;
            if (other.situation === 'Deleted') return false; // Ignore deleted

            const oStart = timeToDec(other.start_time);
            const oEnd = timeToDec(other.finish_time);

            return (start < oEnd && end > oStart);
        });

        return conflicts.length > 0;
    };

    /**
     * Validates and Commits a row (Save/Update).
     * Includes Strict Validation logic for Date/Time/Balance/Overlap.
     */
    const handleCommitRow = async (id) => {
        const ev = editingEvents[id];
        if (!ev) return;

        // Completeness Check
        if (!ev.employee_name || !ev.date || !ev.type || !ev.start_time || !ev.finish_time) {
            alert("Missing required fields");
            return;
        }

        // --- NEW STRICT VALIDATION START ---

        // 1. Context Constraint: Event Date must match Selected Year/Month View
        // (Only strictly enforce if we assume user must be in that view to add.
        // If they are in Yearly view, month might be ambiguous so we skip month check or enforce 'month' state?
        // User said: "prompt him to select the respective month/year where he/she wants to add first"
        // Implies we block if mismatch.)
        const [evY, evM] = ev.date.split('-').map(Number); // YYYY, MM (1-based)
        const isYearMatch = evY === selectedYear;
        // In Yearly view, 'month' might act as 'default' or be ignored.
        // But user request says "within that month and year which is selected".
        // Assuming 'month' state tracks the selected month even in Yearly view (or user meant Monthly view).
        // Let's enforce Strict Year. For Month, if we are in Monthly view, enforce it.
        if (!isYearMatch) {
            alert(`Date ${ev.date} is outside the currently selected year (${selectedYear}).\nPlease navigate to the correct year before adding/updating.`);
            return;
        }
        // If we are in Monthly View (or just enforce global 'month' state which drives the calendar grid)
        if ((evM - 1) !== month) {
            alert(`Date ${ev.date} is outside the currently selected month (${MONTHS[month]}).\nPlease navigate to the correct month before adding/updating.`);
            return;
        }

        // 2. Working Hours Rules
        // Standard: Mon-Fri, 08:15 - 16:30
        const WORKING_START_MIN = 8 * 60 + 15; // 495
        const WORKING_END_MIN = 16 * 60 + 30;  // 990

        const dateObj = new Date(evY, evM - 1, ev.date.split('-')[2]);
        const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isHoliday = holidays.some(h => h.date === ev.date);

        const [sh, sm] = ev.start_time.split(':').map(Number);
        const [fh, fm] = ev.finish_time.split(':').map(Number);
        const sMin = sh * 60 + sm;
        const fMin = fh * 60 + fm;

        const LEAVES = ['PAID', 'SICK', 'MARRIAGE', 'TOIL'];
        const EXTRAS = ['OVERTIME', 'ONCALL'];

        if (LEAVES.includes(ev.type)) {
            // "only allowed for add/update during these days/times [Mon-Fri 08:15-16:30]"
            // "Weekends and Holidays should not be allowed."
            if (isWeekend || isHoliday) {
                alert(`${ev.type} events are only allowed on regular working days (Mon-Fri, non-holiday).`);
                return;
            }
            // Time Check: Must be WITHIN 08:15 - 16:30
            // Start >= 08:15 AND Finish <= 16:30
            if (sMin < WORKING_START_MIN || fMin > WORKING_END_MIN) {
                alert(`${ev.type} events must occur strictly within regular working hours (08:15 - 16:30).`);
                return;
            }
        } else if (EXTRAS.includes(ev.type)) {
            // "only allowed during weekends, holidays or weekdays outside of regular working hours"
            const isRegularWorkDay = (!isWeekend && !isHoliday);
            if (isRegularWorkDay) {
                // Must NOT overlap with 08:15 - 16:30
                // Overlap Logic: max(Start, WorkStart) < min(Finish, WorkEnd)
                const overlap = Math.max(sMin, WORKING_START_MIN) < Math.min(fMin, WORKING_END_MIN);
                if (overlap) {
                    alert(`${ev.type} events on workdays must be outside regular working hours (08:15 - 16:30).`);
                    return;
                }
            }
            // If Weekend or Holiday, any time is fine (implied).
        }

        // --- NEW STRICT VALIDATION END ---

        // Locked Year Check
        const evYear = parseInt(ev.date.split('-')[0], 10);
        if (LOCKED_YEARS.includes(evYear)) {
            alert(`Modifications for year ${evYear} are locked.`);
            return;
        }

        // Strict Validation: SICK and OVERTIME cannot be in future (Finish Time)
        if (ev.type === 'SICK' || ev.type === 'OVERTIME') {
            const [y, m, d] = ev.date.split('-').map(Number);
            const [h, min] = ev.finish_time.split(':').map(Number);
            const evFinishDate = new Date(y, m - 1, d, h, min);
            const now = new Date();

            if (evFinishDate > now) {
                alert(`${ev.type} cannot be recorded for future dates/times.`);
                return;
            }
        }

        // Balance Validation: TOIL and PAID
        if (ev.type === 'TOIL' || ev.type === 'PAID') {
            const y = parseInt(ev.date.split('-')[0], 10);
            const original = events.find(e => e.id === ev.id);

            // Note: calc functions include the current state of 'events'.
            // If we are UPDATING, 'events' contains the OLD record.
            // If we are ADDING, 'events' does NOT contain the new record.

            let currentBalance;
            let creditBack = 0;

            if (ev.type === 'TOIL') {
                currentBalance = calcOtRemaining(ev.employee_name, y);
                if (original && original.type === 'TOIL' && original.situation !== 'Deleted') {
                    creditBack = original.duration || 0;
                }
            } else {
                currentBalance = calcPaidRemaining(ev.employee_name, y);
                if (original && original.type === 'PAID' && original.situation !== 'Deleted') {
                    creditBack = original.duration || 0;
                }
            }

            const projected = currentBalance + creditBack - (ev.duration || 0);

            if (projected < 0) {
                alert(`Insufficient ${ev.type === 'TOIL' ? 'TOIL' : 'Paid Leave'} balance for ${ev.employee_name} in ${y}.\nAvailable: ${formatHours(currentBalance + creditBack)}\nRequired: ${formatHours(ev.duration)}`);
                return;
            }
        }

        // Single Type Per Day Check
        // Exceptions: ONCALL + TOIL is allowed. ONCALL + PAID is allowed.
        // Default: If types differ, BLOCK.
        const sameDayDiffType = events.find(e =>
            e.employee_name === ev.employee_name &&
            e.date === ev.date &&
            e.id !== ev.id &&
            e.situation !== 'Deleted' &&
            e.type !== ev.type
        );

        if (sameDayDiffType) {
            const t1 = ev.type;
            const t2 = sameDayDiffType.type;
            // Check Exceptions
            const isExceptions =
                (t1 === 'ONCALL' && (t2 === 'TOIL' || t2 === 'PAID')) ||
                (t2 === 'ONCALL' && (t1 === 'TOIL' || t1 === 'PAID'));

            if (!isExceptions) {
                alert(`Cannot have different event types on the same date.\nExisting: ${t2}\nNew: ${t1}\nExceptions allowed: ONCALL with TOIL or PAID.`);
                return;
            }
        }

        // Conflict Check
        if (checkOverlap(ev)) {
            alert(`Conflict detected for ${ev.employee_name} on ${ev.date}. Events overlap.`);
            return;
        }

        // Prepare for Save
        const situation = ev.isNew ? 'Added' : 'Updated';
        let toSave = { ...ev, situation };
        if (ev.isNew) {
            // Remove temporary ID so server performs INSERT
            const { id, isNew, ...rest } = toSave;
            toSave = rest;
        }

        try {
            await saveBatch([toSave]);

            // Cleanup
            setEditingRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            setDirtyRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });

            // Remove from newEvents if present
            setNewEvents(prev => prev.filter(e => e.id !== id));

            // Force update selection filters so the new row (now in events) is visible
            if (ev.employee_name) {
                setSelectedEmployees(prev => new Set(prev).add(ev.employee_name));
            }

            // Remove from selection if updated
            if (gridSelection.has(id)) {
                setGridSelection(prev => { const n = new Set(prev); n.delete(id); return n; });
            }

            alert(ev.isNew ? "New event sent for manager's approval" : "Update sent to Manager for approval");
        } catch (e) { console.error(e); alert("Save failed"); }
    };

    const handleRollbackRow = (id) => {
        // Revert to original
        const original = events.find(e => e.id === id);
        if (original && !original.isNew) {
            setEditingEvents(prev => ({ ...prev, [id]: { ...original } }));
        } else if (original && original.isNew) {
            // Reset to defaults if new?
            setEditingEvents(prev => ({ ...prev, [id]: { ...original, start_time: '08:30', finish_time: '16:30' } }));
        }
        setDirtyRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    };

    const handleCancelRow = (id) => {
        // Exit edit mode
        setEditingRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setDirtyRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        const { [id]: removed, ...rest } = editingEvents;
        setEditingEvents(rest);

        // Remove from newEvents if present
        setNewEvents(prev => prev.filter(e => e.id !== id));
        // Also check main events just in case (legacy)
        setEvents(prev => prev.filter(e => e.id !== id));
    };

    const saveBatch = async (rows) => {
        const res = await fetch('/api/save-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows)
        });

        if (!res.ok) throw new Error("Batch Save Failed");
        fetchData(); // Refresh View
    };

    const handleSetSelectedYear = (y) => {
        if (checkUnsavedChanges()) {
            setSelectedYear(y);
            setCurrentDate(new Date(y, month, 1));
        }
    };
    const checkUnsavedChanges = () => {
        if (dirtyRowIds.size > 0) {
            return confirm("You have unsaved changes. Discard?");
        }
        return true;
    };

    // Derived Data for Display
    // Derived Data for Display
    const filteredHistoryEvents = useMemo(() => {
        const filtered = events.filter(e => {
            if (!e.date) return false;

            // Manual parsing to avoid Timezone issues (YYYY-MM-DD)
            const [yStr, mStr, dStr] = e.date.split('-').map(Number);
            // Note: mStr is 1-based (1=Jan)

            const isYearMatch = yStr === selectedYear;
            const isMonthMatch = viewType === 'YEARLY' || (mStr - 1) === month; // Compare 0-indexed month

            const isEmployeeMatch = selectedEmployees.has(e.employee_name);

            // Derive Status for filtering
            const dType = getDerivedType(e);
            let dStatus = e.status;
            if (!dStatus || dStatus === '') dStatus = deriveStatus(dType, e.date, e.finish_time);
            // Logic above relies on e.status being correct in DB or derived live.
            // If e.status is stored, prefer it. If not, derive it.
            // But wait, our deriveStatus implementation returns 'Earned' for OVERTIME etc.
            // Let's assume e.status is reliable or fallback to deriveStatus mechanism consistent with coloring.

            const filterKey = `${dType}|${dStatus}`;
            const typeMatch = selectedFilters.has(filterKey);

            const match = isYearMatch && isMonthMatch && isEmployeeMatch && typeMatch;
            return match;
        });

        return filtered.sort((a, b) => {
            const da = a.date || '';
            const db = b.date || '';
            if (da !== db) return da.localeCompare(db);
            return (a.start_time || '').localeCompare(b.start_time || '');
        });
    }, [events, selectedYear, month, viewType, selectedEmployees, selectedFilters]);

    const handleSelectAll = (e) => {
        const visibleRows = [...newEvents, ...filteredHistoryEvents];
        if (e.target.checked) {
            setGridSelection(new Set(visibleRows.map(r => r.id)));
        } else {
            setGridSelection(new Set());
        }
    };


    const formatHours = (num) => {
        if (!num) return '-';
        return round2(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // --- Calculation Helpers ---
    const getYearlyRow = (emp, y) => {
        // This helper is deprecated for direct row access, but we can adapt it to return an object 
        // mimicking the old structure for compat, or update usage.
        // Let's create a Helper to find a specific Type Value
        return {};
    };

    const getBalanceValue = (emp, y, type) => {
        // yearlyData is now holding rows from yearly_balances (id, employee_name, year, type, value)
        // type is text: 'Entitlement', 'Carryover', 'Adjustment' (Case sensitive from DB?)
        // Check DB content: 'Entitlement', 'Carryover', 'Adjustment' (Title Case)
        const row = yearlyData.find(d =>
            d.employee_name === emp &&
            d.year == y &&
            d.type.toLowerCase() === type.toLowerCase()
        );
        return row ? row.value : 0;
    };

    const getSum = (emp, y, type, status) => {
        return events.filter(ev => {
            if (ev.situation && ['Added', 'Updated', 'Deleted'].includes(ev.situation)) return false;
            const [yStr] = (ev.date || '').split('-');
            if (Number(yStr) !== y) return false;
            if (ev.employee_name !== emp) return false;

            const eType = getDerivedType(ev);
            const eStatus = deriveStatus(eType, ev.date, ev.finish_time);
            // Match Logic
            return eType === type && (ev.status || eStatus) === status;
        }).reduce((acc, ev) => acc + (ev.duration || 0), 0);
    };

    const calcOtRemaining = (emp, y) => {
        const carryOver = getOtCarryOver(emp, y);
        const earned = getSum(emp, y, 'OVERTIME', 'Earned');
        const taken = getSum(emp, y, 'TOIL', 'Taken');
        const planned = getSum(emp, y, 'TOIL', 'Planned');

        // If Carry Over is '-', treat as 0 for calc but return visual?
        // Let's return Number.
        const coVal = carryOver === '-' ? 0 : carryOver;
        return coVal + earned - taken - planned;
    };

    const getOtCarryOver = (emp, y) => {
        if (y === 2025) {
            const val = getBalanceValue(emp, y, 'Overtime Carryover');
            return val !== 0 ? val : '-';
        }
        // For 2026, it is 2025's remaining
        return calcOtRemaining(emp, y - 1);
    };

    const calcPaidRemaining = (emp, y) => {
        const carryOver = getPaidCarryOver(emp, y);
        const entitled = getBalanceValue(emp, y, 'entitlement');
        const adjustment = getBalanceValue(emp, y, 'adjustment');
        const taken = getSum(emp, y, 'PAID', 'Taken');
        const planned = getSum(emp, y, 'PAID', 'Planned');

        return carryOver + entitled + adjustment - taken - planned;
    };

    const getPaidCarryOver = (emp, y) => {
        if (y === 2025) return getBalanceValue(emp, y, 'carryover');
        return calcPaidRemaining(emp, y - 1);
    };


    // --- Monthly Calendar Render ---
    const renderGrid = () => {
        return Array.from({ length: 42 }).map((_, i) => {
            const firstDayOfMonth = new Date(year, month, 1).getDay();
            const adjFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
            const dayNum = i - adjFirstDay + 1;
            const date = new Date(year, month, dayNum);
            const isCurrentMonth = date.getMonth() === month;
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

            if (!isCurrentMonth) return <div key={i} className="monthly-calendar-cell empty"></div>;

            // Filter events for this day
            const dayEvents = events.filter(e => {
                const eDate = new Date(e.date);
                const dType = getDerivedType(e);
                const dStatus = deriveStatus(dType, e.date, e.finish_time); // Use live status logic for accurate display? 
                // Or use e.status? e.status is 'Taken'/'Planned' in DB mostly?
                // Actually Calendar relies on deriveStatus for coloring mainly if it's dynamic.
                // Let's use e.status if present, else derive.
                // Consistent with filteredHistoryEvents logic.
                const statusToUse = e.status || dStatus;

                const filterKey = `${dType}|${dStatus}`;
                const match = e.date === dateStr &&
                    selectedEmployees.has(e.employee_name) &&
                    selectedFilters.has(filterKey);

                return match;
            }).sort((a, b) => {
                // 1. Employee Name
                const empDiff = a.employee_name.localeCompare(b.employee_name);
                if (empDiff !== 0) return empDiff;
                // 2. Start Time
                const timeDiff = (a.start_time || '').localeCompare(b.start_time || '');
                if (timeDiff !== 0) return timeDiff;
                // 3. Event Type
                return (a.type || '').localeCompare(b.type || '');
            });

            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = holidays.find(h => h.date === dateStr);

            return (
                <div key={i} className={`monthly-calendar-cell ${isWeekend ? 'weekend-cell' : ''} ${isHoliday ? 'holiday-cell' : ''}`}>
                    {/* Row 1: Day Number */}
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', paddingLeft: '2px' }}>
                        {dayNum}
                    </div>
                    {/* Row 2: Holiday Name or Empty */}
                    <div style={{ fontSize: '0.7rem', color: 'red', fontWeight: 'bold', minHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: '2px' }}>
                        {isHoliday ? isHoliday.description : '\u00A0'}
                    </div>
                    {/* Row 3: Spacer */}
                    <div style={{ height: '10px' }}></div>
                    {/* Row 4: Events */}
                    <div className="monthly-calendar-cell-grid">
                        {dayEvents.map(ev => {
                            let colorClass = getEventColorClass(ev.type, ev.status);
                            if (ev.situation && ['Added', 'Updated', 'Deleted'].includes(ev.situation)) {
                                colorClass = ev.situation;
                            }

                            // Remove seconds from times (HH:MM:SS -> HH:MM)
                            const formatTime = (t) => (t || '').substring(0, 5);
                            const start = formatTime(ev.start_time);
                            const finish = formatTime(ev.finish_time);

                            // Format: <EVENT TYPE SHORT FORM> : <START TIME>-<FINISH TIME> (<DURATION>)
                            const coreFormat = `${SHORT[ev.type]} : ${start}-${finish} (${formatHours(ev.duration)})`;
                            const display = isManager ? `${ev.employee_name} : ${coreFormat}` : coreFormat;

                            return (
                                <div key={ev.id} className={`monthly-calendar-cell-grid-column-slot ${colorClass}`}>
                                    {display}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        });
    };

    const toggleEmployee = (e) => {
        const next = new Set(selectedEmployees);
        if (next.has(e)) next.delete(e); else next.add(e);
        setSelectedEmployees(next);
        setAllEmployeesChecked(next.size === employees.length);
    };
    const toggleAllEmployees = () => {
        if (allEmployeesChecked) { setSelectedEmployees(new Set()); setAllEmployeesChecked(false); }
        else { setSelectedEmployees(new Set(employees)); setAllEmployeesChecked(true); }
    };
    const toggleFilter = (t, s) => {
        const key = `${t}|${s}`;
        const next = new Set(selectedFilters);
        if (next.has(key)) next.delete(key); else next.add(key);
        setSelectedFilters(next);
    };

    return (
        <div className={`main-layout`}>
            <div className="view-header-row" style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', padding: '10px 0', borderBottom: '1px solid #ccc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* View Selector Removed */}
                <div className="year-selector" style={{ display: 'flex', gap: 10 }}>
                    {YEARS.map(y => (
                        <button key={y} onClick={() => handleSetSelectedYear(y)} className={selectedYear === y ? 'active' : ''}>{y}</button>
                    ))}
                </div>
                <div className="month-selector" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {MONTHS.map((m, idx) => (
                        <button key={m} onClick={() => { if (checkUnsavedChanges()) setCurrentDate(new Date(selectedYear, idx, 1)); }} className={month === idx ? 'active' : ''}>{m}</button>
                    ))}
                </div>
            </div>

            <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 20, paddingBottom: 50 }}>

                <div className="totals-wrapper" style={{ display: 'flex', flexDirection: isManager ? 'column' : 'row', gap: '20px', width: '100%', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* 1. Yearly Totals */}
                    <div className="yearly-totals-section" style={{ width: isManager ? '100%' : 'fit-content', overflowX: 'auto' }}>
                        <h3 style={{ margin: '0 0 10px 0', backgroundColor: '#555', color: 'white', padding: '10px' }}>Yearly Totals: {selectedYear}</h3>
                        <div className="yearly-grid" style={{ width: '100%' }}>
                            {/* Headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: `30px 90px 70px repeat(${visibleEmployees.length}, ${isManager ? '1fr' : 'auto'}) ${isManager ? '1fr' : ''}`, gap: '1px', marginBottom: '1px' }}>
                                <div className="yearly-cell header-cell"></div>
                                <div className="yearly-cell header-cell">Type</div>
                                <div className="yearly-cell header-cell">Status</div>
                                {visibleEmployees.map(e => <div key={e} className="yearly-cell header-cell" style={{ fontSize: '0.7rem', padding: '0 10px', whiteSpace: 'nowrap' }}>{e}</div>)}
                                {isManager && <div className="yearly-cell header-cell">Totals</div>}
                            </div>

                            {[
                                {
                                    title: 'Overtime', rows: [
                                        { type: 'calc', label: 'Carry Over', valFn: getOtCarryOver, color: 'row-grey' },
                                        { t: 'OVERTIME', s: 'Earned' },
                                        { t: 'TOIL', s: 'Taken', color: 'toil-taken-bg' },
                                        { t: 'TOIL', s: 'Planned' },
                                        { type: 'calc', label: 'Remaining', valFn: calcOtRemaining, color: 'row-grey' }
                                    ]
                                },
                                {
                                    title: 'Paid Leave', rows: [
                                        { type: 'calc', label: 'Carry Over', valFn: getPaidCarryOver, color: 'row-grey' },
                                        { type: 'bal', label: 'Entitlement', field: 'entitlement', color: 'row-grey' },
                                        { type: 'bal', label: 'Adjustment', field: 'adjustment', color: 'row-grey' },
                                        { t: 'PAID', s: 'Taken', color: 'paid-taken-bg' },
                                        { t: 'PAID', s: 'Planned' },
                                        { type: 'calc', label: 'Remaining', valFn: calcPaidRemaining, color: 'row-grey' }
                                    ]
                                },
                                {
                                    title: 'Other Leaves', rows: [{ t: 'SICK', s: 'Taken', color: 'sick-bg' }, { t: 'MARRIAGE', s: 'Taken' }, { t: 'MARRIAGE', s: 'Planned' }]
                                },
                                { title: 'Others', rows: [{ t: 'ONCALL', s: 'Done', color: 'oncall-done-bg' }, { t: 'ONCALL', s: 'Planned', color: 'oncall-planned-bg' }] }
                            ].map((section, sIdx) => (
                                <React.Fragment key={sIdx}>
                                    <div style={{ gridColumn: '1 / -1', backgroundColor: '#555', color: 'white', padding: '5px', fontWeight: 'bold', borderBottom: '1px solid #ccc' }}>
                                        {section.title}
                                    </div>
                                    {section.rows.map((r, rIdx) => {
                                        const isCalc = r.type === 'calc';
                                        const isDb = r.type === 'db'; // Legacy flag, kept if needed but removed from usage
                                        const isBal = r.type === 'bal'; // New flag for EAV
                                        const label = r.label || r.t;
                                        const statusLabel = r.s || '';

                                        // Color logic
                                        // Prioritize explicit color in config, else derive from event type
                                        let colorClass = r.color;
                                        if (!colorClass) {
                                            colorClass = getEventColorClass(r.t, r.s).replace('row-', '').replace('-bg', '');
                                        }

                                        // Apply this color to ALL columns (Headers, Values, Totals)
                                        // Previously we distinguished 'standardBgClass' but user wants uniform row colors
                                        const cellClass = colorClass;

                                        return (
                                            <div key={`${sIdx}-${rIdx}`} style={{ display: 'grid', gridTemplateColumns: `30px 90px 70px repeat(${visibleEmployees.length}, ${isManager ? '1fr' : 'auto'}) ${isManager ? '1fr' : ''}`, gap: '1px' }}>
                                                {/* Empty Checkbox Placeholder */}
                                                <div className={`yearly-cell header-cell ${colorClass}`}></div>

                                                <div className={`yearly-cell header-cell ${colorClass}`} style={{ borderBottom: '1px solid white' }}>{label}</div>
                                                <div className={`yearly-cell header-cell ${colorClass}`} style={{ borderBottom: '1px solid white' }}>{statusLabel}</div>

                                                {/* Employee Columns */}
                                                {visibleEmployees.map(e => {
                                                    if (!selectedEmployees.has(e)) return <div key={e} className={`yearly-cell ${cellClass}`} style={{ borderRight: '1px solid white', borderBottom: '1px solid white', textAlign: 'center' }}>-</div>;

                                                    let val = 0;
                                                    if (isCalc) {
                                                        val = r.valFn(e, selectedYear);
                                                    } else if (isBal) {
                                                        val = getBalanceValue(e, selectedYear, r.field);
                                                    } else {
                                                        // Standard Data Sum
                                                        val = getSum(e, selectedYear, r.t, r.s);
                                                    }

                                                    // Formatting
                                                    let displayVal = val;
                                                    if (typeof val === 'number') displayVal = formatHours(val);

                                                    return <div key={e} className={`yearly-cell ${cellClass}`} style={{ borderRight: '1px solid white', borderBottom: '1px solid white', textAlign: 'right', paddingRight: '5px' }}>{displayVal}</div>;
                                                })}

                                                {/* Grand Total */}
                                                {isManager && (() => {
                                                    // User requested white forecolor for specific rows in Grand Total
                                                    // These generally correspond to rows that are NOT 'calc' or 'bal' (Calculated/Balance)
                                                    // or strictly specified rows like TOIL/PAID/SICK/ONCALL/MARRIAGE
                                                    // Actually, purely calc rows (CarryOver, Remaining) usually are grey/black.
                                                    // Event rows are colored/white.
                                                    // Let's enforce white for !isCalc && !isBal effectively, or specific known types.
                                                    // User list: OVERTIME, TOIL(Taken/Planned), PAID(Taken/Planned), SICK, MARRIAGE, ONCALL
                                                    // These are exactly the rows where isCalc and isBal are false, OR they have explicit colors like sick-bg

                                                    const useWhiteText = !isCalc && !isBal;
                                                    const gtStyle = {
                                                        padding: '0 5px',
                                                        color: useWhiteText ? 'white' : 'inherit',
                                                        textAlign: 'right',
                                                        fontWeight: 'bold'
                                                    };

                                                    return (
                                                        <div className={`yearly-cell header-cell ${colorClass}`} style={gtStyle}>
                                                            {formatHours(
                                                                visibleEmployees.filter(e => selectedEmployees.has(e)).reduce((accE, empName) => {
                                                                    let v = 0;
                                                                    if (isCalc) v = r.valFn(empName, selectedYear); // Sum of calculated?
                                                                    else if (isBal) v = getBalanceValue(empName, selectedYear, r.field);
                                                                    else v = getSum(empName, selectedYear, r.t, r.s);

                                                                    if (v === '-') v = 0;
                                                                    return accE + (Number(v) || 0);
                                                                }, 0)
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>

                    {/* 2. Monthly Summary Totals */}
                    <div className="monthly-summary-section" style={{ width: isManager ? '100%' : 'fit-content', overflowX: 'auto' }}>
                        <h3 style={{ margin: '0 0 10px 0', backgroundColor: '#555', color: 'white', padding: '10px' }}>Monthly Totals: {MONTHS[month]} {selectedYear}</h3>
                        <div className="summary-totals-grid" style={{ width: '100%' }}>
                            {/* Monthly Headers */}
                            <div className="summary-totals-row" style={{ display: 'grid', gridTemplateColumns: `30px 90px 70px repeat(${visibleEmployees.length}, ${isManager ? '1fr' : 'auto'}) ${isManager ? '1fr' : ''}`, gap: '1px' }}>
                                <div className="summary-totals-cell header-cell"></div>
                                <div className="summary-totals-cell header-cell">Type</div>
                                <div className="summary-totals-cell header-cell">Status</div>
                                {visibleEmployees.map(e => (
                                    <div key={e} className="summary-totals-cell header-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '0.7rem', padding: '0 10px' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedEmployees.has(e)}
                                            onChange={() => toggleEmployee(e)}
                                        />
                                        {e}
                                    </div>
                                ))}
                                {isManager && <div className="summary-totals-cell header-cell">Totals</div>}
                            </div>

                            {[
                                { title: 'Overtime', rows: [{ t: 'OVERTIME', s: 'Earned' }, { t: 'TOIL', s: 'Taken' }, { t: 'TOIL', s: 'Planned' }] },
                                { title: 'Paid Leave', rows: [{ t: 'PAID', s: 'Taken' }, { t: 'PAID', s: 'Planned' }] },
                                { title: 'Other Leaves', rows: [{ t: 'SICK', s: 'Taken' }, { t: 'SICK', s: 'Planned' }, { t: 'MARRIAGE', s: 'Taken' }, { t: 'MARRIAGE', s: 'Planned' }] },
                                { title: 'Others', rows: [{ t: 'ONCALL', s: 'Done' }, { t: 'ONCALL', s: 'Planned' }] }
                            ].map((section, sIdx) => (
                                <React.Fragment key={sIdx}>
                                    <div style={{ gridColumn: '1 / -1', backgroundColor: '#555', color: 'white', padding: '5px', fontWeight: 'bold', borderBottom: '1px solid #ccc' }}>
                                        {section.title}
                                    </div>
                                    {section.rows.map(({ t, s }) => (
                                        <div key={`${t}-${s}`} className="summary-totals-row" style={{ display: 'grid', gridTemplateColumns: `30px 90px 70px repeat(${visibleEmployees.length}, ${isManager ? '1fr' : 'auto'}) ${isManager ? '1fr' : ''}`, gap: '1px' }}>
                                            {/* Checkbox Column */}
                                            <div className={`summary-totals-cell header-cell ${getEventColorClass(t, s).replace('row-', '').replace('-bg', '')}`} style={{ textAlign: 'center' }}>
                                                <input type="checkbox" checked={selectedFilters.has(`${t}|${s}`)} onChange={() => toggleFilter(t, s)} />
                                            </div>
                                            {/* Type Column */}
                                            <div className={`summary-totals-cell header-cell ${getEventColorClass(t, s).replace('row-', '').replace('-bg', '')}`}>
                                                {t}
                                            </div>
                                            {/* Status Column */}
                                            <div className={`summary-totals-cell header-cell ${getEventColorClass(t, s).replace('row-', '').replace('-bg', '')}`}>
                                                {s}
                                            </div>
                                            {/* Employee Totals */}
                                            {visibleEmployees.map(e => {
                                                if (!selectedEmployees.has(e)) return <div key={e} className="summary-totals-cell">-</div>;
                                                if (!selectedFilters.has(`${t}|${s}`)) return <div key={e} className="summary-totals-cell">-</div>;

                                                const val = events.filter(ev => {
                                                    if (ev.situation === 'Added' || ev.situation === 'Updated' || ev.situation === 'Deleted') return false;
                                                    // Monthly Scope: Year AND Month
                                                    const [yStr, mStr] = (ev.date || '').split('-');
                                                    const inScope = (Number(yStr) === selectedYear && (Number(mStr) - 1) === month);

                                                    return inScope && ev.employee_name === e && getDerivedType(ev) === t && ev.status === s;
                                                }).reduce((acc, curr) => acc + (curr.duration || 0), 0);

                                                // Apply Color Class to Cell
                                                const colorClass = getEventColorClass(t, s).replace('row-', '').replace('-bg', '');
                                                // Ensure we use the proper class that sets background
                                                // Actually getEventColorClass usually returns something like 'overtime-bg' or 'row-overtime'
                                                // Let's use the helper directly but stripped to match CSS

                                                // Re-use logic from Yearly: try to match known bg classes
                                                let finalClass = colorClass;
                                                if (t === 'TOIL' && s === 'Taken') finalClass = 'toil-taken-bg';
                                                if (t === 'PAID' && s === 'Taken') finalClass = 'paid-taken-bg';
                                                if (t === 'SICK' && s === 'Taken') finalClass = 'sick-bg';
                                                if (t === 'ONCALL' && s === 'Done') finalClass = 'oncall-done-bg';
                                                if (t === 'ONCALL' && s === 'Planned') finalClass = 'oncall-planned-bg';

                                                return <div key={e} className={`summary-totals-cell ${finalClass}`} style={{ color: 'white' }}>{formatHours(val)}</div>;
                                            })}
                                            {/* Grand Total Column */}
                                            {isManager && (() => {
                                                let colorClass = getEventColorClass(t, s).replace('row-', '').replace('-bg', '');
                                                if (t === 'TOIL' && s === 'Taken') colorClass = 'toil-taken-bg';
                                                if (t === 'PAID' && s === 'Taken') colorClass = 'paid-taken-bg';
                                                if (t === 'SICK' && s === 'Taken') colorClass = 'sick-bg';
                                                if (t === 'ONCALL' && s === 'Done') colorClass = 'oncall-done-bg';
                                                if (t === 'ONCALL' && s === 'Planned') colorClass = 'oncall-planned-bg';

                                                return (
                                                    <div className={`summary-totals-cell header-cell ${colorClass}`} style={{ color: 'white', alignItems: 'flex-end', textAlign: 'right' }}>
                                                        {!selectedFilters.has(`${t}|${s}`) ? '-' : formatHours(
                                                            visibleEmployees.filter(e => selectedEmployees.has(e)).reduce((accE, empName) => {
                                                                const empVal = events.filter(ev => {
                                                                    if (ev.situation === 'Added' || ev.situation === 'Updated' || ev.situation === 'Deleted') return false;
                                                                    const [yStr, mStr] = (ev.date || '').split('-');
                                                                    const inScope = (Number(yStr) === selectedYear && (Number(mStr) - 1) === month);
                                                                    return inScope && ev.employee_name === empName && getDerivedType(ev) === t && ev.status === s;
                                                                }).reduce((acc, curr) => acc + (curr.duration || 0), 0);
                                                                return accE + empVal;
                                                            }, 0)
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* WRAPPER FOR SYNCED WIDTHS: Calendar + Events */}
                <div style={{ display: 'flex', flexDirection: 'column', width: 'fit-content', minWidth: '100%' }}>
                    {/* 3. Monthly Calendar Grid */}
                    <div className="monthly-calendar-section" style={{ width: '100%' }}>
                        <h3 style={{ margin: '0 0 10px 0', backgroundColor: '#555', color: 'white', padding: '10px' }}>Events Calendar {MONTHS[month]} {selectedYear}</h3>
                        <div className="monthly-calendar-container" style={{ width: '100%' }}>
                            <div className="monthly-calendar-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', width: '100%' }}>
                                {DAYS.map(d => <div key={d} className="monthly-calendar-cell day-name" style={{ padding: '2px 8px', backgroundColor: '#555' }}>{d}</div>)}
                                {renderGrid()}
                            </div>
                        </div>
                    </div>

                    {/* 4. Events Grid (History) */}
                    <div className="history-row" style={{ width: 'fit-content', minWidth: '100%', marginTop: 20 }}>
                        <h3 style={{ margin: '0 0 10px 0', backgroundColor: '#555', color: 'white', padding: '10px' }}>Events' details {MONTHS[month]} {selectedYear}</h3>
                        <div className="history-grid-container" style={{ width: 'fit-content', minWidth: '100%' }}>
                            {/* New Toolbar */}
                            <table style={{ width: 'auto', minWidth: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#555', color: 'white' }}>
                                        <th style={{ padding: 8, width: '50px' }}>
                                            <input
                                                type="checkbox"
                                                checked={gridSelection.size > 0 && gridSelection.size === ([...newEvents, ...filteredHistoryEvents].length)}
                                                onChange={handleSelectAll}
                                            />
                                        </th>
                                        <th style={{ padding: 8 }}> {/* Dynamic Actions Column */}
                                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                                {!isManager && (
                                                    <>
                                                        <button
                                                            className="toolbar-btn add-btn small"
                                                            onClick={handleAddEvent}
                                                            disabled={LOCKED_YEARS.includes(selectedYear)}
                                                            style={{ padding: '2px 8px', fontSize: 12, backgroundColor: LOCKED_YEARS.includes(selectedYear) ? '#ccc' : '#d4edda', color: LOCKED_YEARS.includes(selectedYear) ? '#666' : '#155724', cursor: LOCKED_YEARS.includes(selectedYear) ? 'not-allowed' : 'pointer' }}>
                                                            Add
                                                        </button>
                                                        <button
                                                            className="toolbar-btn update-btn small"
                                                            onClick={handleBatchUpdate}
                                                            disabled={gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)}
                                                            style={{ padding: '2px 8px', fontSize: 12, cursor: (gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)) ? 'not-allowed' : 'pointer', opacity: LOCKED_YEARS.includes(selectedYear) ? 0.6 : 1 }}>
                                                            Update
                                                        </button>
                                                        <button
                                                            className="toolbar-btn delete-btn small"
                                                            onClick={handleBatchDelete}
                                                            disabled={gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)}
                                                            style={{ padding: '2px 8px', fontSize: 12, cursor: (gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)) ? 'not-allowed' : 'pointer', opacity: LOCKED_YEARS.includes(selectedYear) ? 0.6 : 1 }}>
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                                {isManager && (
                                                    <>
                                                        <button
                                                            className="toolbar-btn approve-btn small"
                                                            onClick={handleBatchApprove}
                                                            disabled={gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)}
                                                            style={{ padding: '2px 8px', fontSize: 12, backgroundColor: LOCKED_YEARS.includes(selectedYear) ? '#ccc' : '#90ee90', color: LOCKED_YEARS.includes(selectedYear) ? '#666' : '#006400', cursor: LOCKED_YEARS.includes(selectedYear) ? 'not-allowed' : 'pointer' }}>
                                                            Approve
                                                        </button>
                                                        <button
                                                            className="toolbar-btn reject-btn small"
                                                            onClick={handleBatchReject}
                                                            disabled={gridSelection.size === 0 || LOCKED_YEARS.includes(selectedYear)}
                                                            style={{ padding: '2px 8px', fontSize: 12, backgroundColor: LOCKED_YEARS.includes(selectedYear) ? '#ccc' : '#dc3545', color: LOCKED_YEARS.includes(selectedYear) ? '#666' : 'white', marginLeft: 5, cursor: LOCKED_YEARS.includes(selectedYear) ? 'not-allowed' : 'pointer' }}>
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </th>
                                        {isManager && <th style={{ padding: 8 }}>Employee</th>}
                                        <th style={{ padding: 8 }}>Type</th>
                                        <th style={{ padding: 8 }}>Status</th>
                                        <th style={{ padding: 8 }}>Situation</th>
                                        <th style={{ padding: 8 }}>Date</th>
                                        <th style={{ padding: 8 }}>Start Time</th>
                                        <th style={{ padding: 8 }}>Finish Time</th>
                                        <th style={{ padding: 8 }}>Duration</th>
                                        <th style={{ padding: 8, width: '650px' }}>Comment</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...newEvents, ...filteredHistoryEvents].map(row => {
                                        const id = row.id;
                                        const isChecked = gridSelection.has(id);
                                        const isEditing = editingRowIds.has(id);
                                        const isDirty = dirtyRowIds.has(id);
                                        const data = isEditing ? editingEvents[id] : row;

                                        // Determine Row Class
                                        let rowClass = '';
                                        if (data.situation === 'Added' || data.situation === 'Updated' || data.situation === 'Deleted') {
                                            rowClass = data.situation; // Yellow (via CSS tr.Added !important)
                                        } else {
                                            // "Approved" rows get color full width
                                            rowClass = getEventColorClass(data.type, data.status, true);
                                        }

                                        return (
                                            <tr key={id} style={{ borderBottom: '1px solid #ddd' }} className={rowClass}>
                                                <td style={{ padding: 8 }}>
                                                    {((isManager && ['Added', 'Updated', 'Deleted'].includes(data.situation)) || (!isManager && data.situation === 'Approved')) && (
                                                        <input type="checkbox" checked={isChecked} onChange={() => toggleGridSelection(id)} />
                                                    )}
                                                </td>
                                                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', gap: 2 }}>
                                                            <button className="row-action-btn commit" title="Commit" disabled={!isDirty} onClick={() => handleCommitRow(id)}>Commit</button>
                                                            <button className="row-action-btn rollback" title="Rollback" disabled={!isDirty} onClick={() => handleRollbackRow(id)}>Rollback</button>
                                                            <button className="row-action-btn cancel" title="Cancel" onClick={() => handleCancelRow(id)}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        // Manager Per-Row Actions
                                                        isManager && ['Added', 'Updated', 'Deleted'].includes(data.situation) && (
                                                            <div style={{ display: 'flex', gap: 2 }}>
                                                                <button className="toolbar-btn approve-btn small" onClick={() => handleRowApprove(id)} style={{ padding: '2px 8px', fontSize: 12, backgroundColor: '#90ee90', color: '#006400', border: 'none', cursor: 'pointer' }}>Approve</button>
                                                                <button className="toolbar-btn reject-btn small" onClick={() => handleRowReject(id)} style={{ padding: '2px 8px', fontSize: 12, backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer' }}>Reject</button>
                                                            </div>
                                                        )
                                                    )}
                                                </td>
                                                {isManager && <td style={{ padding: 8 }}>{data.employee_name}</td>}
                                                {/* Type Input (Moved First) */}
                                                <td style={{ padding: 8 }}>
                                                    {isEditing ? (
                                                        <select value={data.type} onChange={e => handleFieldChange(id, 'type', e.target.value)} style={{ color: 'black' }}>
                                                            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    ) : data.type}
                                                </td>
                                                {/* Status Input (Read-Only) */}
                                                <td style={{ padding: 8 }}>
                                                    {/* Show text only, even in edit mode, as it's auto-calculated */}
                                                    {data.status}
                                                </td>
                                                <td style={{ padding: 8 }}>{data.situation || 'Approved'}</td>
                                                <td style={{ padding: 8 }}>
                                                    {isEditing ? <input type="date" value={data.date} onChange={e => handleFieldChange(id, 'date', e.target.value)} /> : data.date}
                                                </td>
                                                <td style={{ padding: 8 }}>
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="grid-input"
                                                            value={data.start_time}
                                                            onChange={e => handleFieldChange(id, 'start_time', e.target.value)}
                                                            onBlur={e => handleTimeBlur(id, 'start_time', e.target.value)}
                                                        />
                                                    ) : (data.start_time || '').substring(0, 5)}
                                                </td>
                                                <td style={{ padding: 8 }}>
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="grid-input"
                                                            value={data.finish_time}
                                                            onChange={e => handleFieldChange(id, 'finish_time', e.target.value)}
                                                            onBlur={e => handleTimeBlur(id, 'finish_time', e.target.value)}
                                                        />
                                                    ) : (data.finish_time || '').substring(0, 5)}
                                                </td>
                                                <td style={{ padding: 8 }}>{formatHours(data.duration)}</td>
                                                <td style={{ padding: 8 }} className="comment-cell">
                                                    {isEditing ? <input type="text" value={data.comment || ''} onChange={e => handleFieldChange(id, 'comment', e.target.value)} /> : data.comment}
                                                </td>
                                            </tr>
                                        );
                                    })
                                    }
                                    {
                                        [...newEvents, ...filteredHistoryEvents].length === 0 && (
                                            <tr><td colSpan={11} style={{ padding: 20, textAlign: 'center' }}>No events found</td></tr>
                                        )
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Calendar;
