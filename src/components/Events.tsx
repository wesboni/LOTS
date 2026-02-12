import React, { useState } from 'react';
import styles from './Events.module.css';
import RecurrenceModal from './RecurrenceModal';
import { Event, YearlyBalance, Holiday, User, Employee } from '../types';
import {
    MONTHS, EVENT_TYPES, LOCKED_YEARS,
    formatHours, calcDuration, calcDurationTime, deriveStatus, getEventColorClass,
    calcOtRemaining, calcPaidRemaining, formatEmployeeName
} from '../utils';

interface EventsProps {
    visibleEvents: Event[];
    allEvents: Event[];
    selectedYear: number;
    month: number;
    employees: Employee[];
    currentUser: User;
    isManager: boolean;
    yearlyData: YearlyBalance[];
    holidays: Holiday[];
    onRefresh: () => void;
    onDirtyChange: (isDirty: boolean) => void;
}

const Events: React.FC<EventsProps> = ({
    visibleEvents,
    allEvents,
    selectedYear,
    month,
    employees,
    currentUser,
    isManager,
    yearlyData,
    holidays,
    onRefresh,
    onDirtyChange
}) => {
    // Grid State
    const [gridSelection, setGridSelection] = useState<Set<string | number>>(new Set());
    const [editingRowIds, setEditingRowIds] = useState<Set<string | number>>(new Set());
    const [editingEvents, setEditingEvents] = useState<Record<string | number, Event>>({});
    const [dirtyRowIds, setDirtyRowIds] = useState<Set<string | number>>(new Set());
    const [newEvents, setNewEvents] = useState<Event[]>([]);

    React.useEffect(() => {
        onDirtyChange(dirtyRowIds.size > 0);
    }, [dirtyRowIds, onDirtyChange]);

    const toggleGridSelection = (id: number | string) => {
        const next = new Set(gridSelection);
        if (next.has(id)) next.delete(id); else next.add(id);
        setGridSelection(next);
    };

    const isSelfEvent = (ev: Event) => {
        // Robust check: ID -> Email -> Name
        if (currentUser.employee_id && ev.employee_id) {
            return currentUser.employee_id === ev.employee_id;
        }
        // Fallback to name match (legacy)
        return currentUser.name.toLowerCase().includes(ev.employee_name.toLowerCase()) ||
            ev.employee_name.toLowerCase().includes(currentUser.name.toLowerCase());
    };

    const handleAddEvent = () => {
        const newId = `temp-${Date.now()}`;
        // Use currentUser directly as default for non-managers
        const myName = currentUser.name;
        const myId = currentUser.employee_id;

        const defaultDate = `${selectedYear}-${String(month + 1).padStart(2, '0')}-01`;
        const defaultType = 'TOIL';
        const defaultStart = '08:30:00';
        const defaultFinish = '16:30:00';

        const newEv: Event = {
            id: newId,
            employee_name: isManager ? '' : myName, // Manager must select
            employee_id: isManager ? null : (myId || null),
            type: defaultType,
            status: deriveStatus(defaultType, defaultDate, defaultFinish),
            date: defaultDate,
            start_time: defaultStart,
            finish_time: defaultFinish,
            duration_hour: calcDuration(defaultStart, defaultFinish),
            duration_time: calcDurationTime(defaultStart, defaultFinish),
            comment: '',
            situation: 'Added',
            isNew: true
        };

        setNewEvents(prev => [...prev, newEv]);
        setEditingRowIds(prev => new Set(prev).add(newId));
        setEditingEvents(prev => ({ ...prev, [newId]: newEv }));
        setDirtyRowIds(prev => new Set(prev).add(newId));
    };

    const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
    const [recurrenceData, setRecurrenceData] = useState<any>(null); // For editing
    const [showAddMenu, setShowAddMenu] = useState(false); // For Hover Menu

    // ... handleAddEvent ...

    const handleOpenRecurrence = () => {
        setRecurrenceData(null); // Clear for new
        setShowRecurrenceModal(true);
        setShowAddMenu(false);
    };

    const handleSaveRecurrence = async (data: any) => {
        try {
            const res = await fetch('/api/recurrences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create recurrence");
            }
            setShowRecurrenceModal(false);
            onRefresh();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleBatchUpdate = async () => {
        // Check if single selection and has recurrence_id
        if (gridSelection.size === 1) {
            const id = Array.from(gridSelection)[0];
            const ev = visibleEvents.find(e => e.id === id);
            if (ev && ev.recurrence_id) {
                // Prompt User
                // We can use a custom modal or simple confirm/prompt for now.
                // User request: "similar window should be presented... with choice to be updated"
                // Let's use window.confirm? No, we need 3 choices: Cancel, Edit Occurrence, Edit Series.
                // Browser confirm is Yes/No.
                // Let's use a simple heuristic:
                // "Do you want to edit the entire SERIES? Click OK for Series, Cancel for Single Occurrence."
                if (confirm("This is a recurring event. Do you want to edit the entire series?\nOK = Edit Series\nCancel = Edit Single Occurrence")) {
                    // Edit Series
                    try {
                        const res = await fetch(`/api/recurrences/${ev.recurrence_id}`);
                        if (res.ok) {
                            const data = await res.json();
                            setRecurrenceData(data);
                            setShowRecurrenceModal(true);
                            return; // Exit, don't enable inline edit
                        }
                    } catch (e) {
                        alert("Failed to load recurrence data");
                    }
                }
            }
        }

        const newEditing = new Set(editingRowIds);
        const newEdits = { ...editingEvents };

        gridSelection.forEach(id => {
            if (!newEditing.has(id)) {
                // Check newEvents first, then visibleEvents
                const row = newEvents.find(e => e.id === id) || visibleEvents.find(e => e.id === id);
                if (row) {
                    newEditing.add(id);
                    newEdits[id] = { ...row };
                }
            }
        });
        setEditingRowIds(newEditing);
        setEditingEvents(newEdits);
    };

    const saveBatch = async (rows: any[]) => {
        const res = await fetch('/api/save-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || errData.message || "Batch Save Failed");
        }
        onRefresh();
    };

    const handleBatchDelete = () => {
        if (!confirm(`Are you sure you want to delete ${gridSelection.size} event(s)?`)) return;

        const rowsToDelete: any[] = [];
        gridSelection.forEach(id => {
            const row = newEvents.find(e => e.id === id) || visibleEvents.find(e => e.id === id);
            if (row) {
                // If it's a temp new event (not saved), just remove from UI?
                // But handleAddEvent puts it in newEvents.
                // If it hasn't been saved to DB yet, we just remove from state.
                if (String(id).startsWith('temp-')) {
                    setNewEvents(prev => prev.filter(e => e.id !== id));
                    // Also cleanup edit state
                    setEditingRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
                    return;
                }
                // Existing DB event -> Soft Delete
                rowsToDelete.push({ ...row, situation: 'Deleted' });
            }
        });

        if (rowsToDelete.length > 0) {
            saveBatch(rowsToDelete).then(() => {
                setGridSelection(new Set());
            });
        } else {
            setGridSelection(new Set());
        }
    };

    const performApprove = (ids: (number | string)[]) => {
        if (ids.length === 0) return;
        fetch('/api/approve-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        }).then(async res => {
            if (res.ok) {
                onRefresh();
                setGridSelection(new Set());
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Approval Failed: ${err.message || res.statusText}`);
            }
        }).catch(err => {
            alert(`Approval Failed: ${err.message}`);
        });
    };

    const handleBatchApprove = () => {
        const validIds = Array.from(gridSelection).filter(id => {
            const ev = newEvents.find(e => e.id === id) || visibleEvents.find(e => e.id === id);
            // Cannot approve own events (Unless Admin)
            if (!ev) return false;
            return currentUser.is_admin ? true : !isSelfEvent(ev);
        });
        if (validIds.length === 0) {
            alert("No events selectable for approval (You cannot approve your own events).");
            return;
        }
        performApprove(validIds);
    };

    const performReject = (ids: (number | string)[]) => {
        if (ids.length === 0) return;
        fetch('/api/reject-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        }).then(async res => {
            if (res.ok) {
                onRefresh();
                setGridSelection(new Set());
            } else {
                alert("Reject Failed");
            }
        });
    };

    const handleBatchReject = () => {
        if (!confirm("Confirm Reject?")) return;
        const validIds = Array.from(gridSelection).filter(id => {
            const ev = newEvents.find(e => e.id === id) || visibleEvents.find(e => e.id === id);
            // Cannot reject own events (Unless Admin)
            if (!ev) return false;
            return currentUser.is_admin ? true : !isSelfEvent(ev);
        });
        if (validIds.length === 0) {
            alert("No events selectable for rejection (You cannot reject your own events, you can Delete them instad).");
            return;
        }
        performReject(validIds);
    };

    const checkOverlap = (ev: Event): boolean => {
        const timeToDec = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h + m / 60;
        };
        const start = timeToDec(ev.start_time);
        const end = timeToDec(ev.finish_time);

        return allEvents.some(other => {
            if (other.id === ev.id) return false;
            if (other.employee_name !== ev.employee_name) return false;
            if (other.date !== ev.date) return false;
            if (other.situation === 'Deleted') return false;

            const oStart = timeToDec(other.start_time);
            const oEnd = timeToDec(other.finish_time);
            return (start < oEnd && end > oStart);
        });
    };

    const handleFieldChange = (id: number | string, field: string, value: any) => {
        setEditingEvents(prev => {
            const row = prev[id];
            const newEv = { ...row, [field]: value } as any as Event;

            if (field === 'type' || field === 'date' || field === 'finish_time') {
                newEv.status = deriveStatus(newEv.type, newEv.date, newEv.finish_time);
            }
            if (field === 'start_time' || field === 'finish_time') {
                const s = field === 'start_time' ? value : newEv.start_time;
                const f = field === 'finish_time' ? value : newEv.finish_time;
                newEv.duration_hour = calcDuration(s, f);
                newEv.duration_time = calcDurationTime(s, f);
            }
            return { ...prev, [id]: newEv };
        });
        setDirtyRowIds(prev => new Set(prev).add(id));
    };

    const handleEmployeeChange = (id: number | string, empId: number) => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;

        setEditingEvents(prev => {
            const row = prev[id];
            // Update both ID and Name
            const newEv = { ...row, employee_id: emp.id, employee_name: emp.name } as any as Event;
            return { ...prev, [id]: newEv };
        });
        setDirtyRowIds(prev => new Set(prev).add(id));
    };

    const handleCommitRow = async (id: number | string) => {
        try {
            const ev = editingEvents[id];
            if (!ev) return;

            // 1. Completeness
            if (!ev.employee_name || !ev.date || !ev.type || !ev.start_time || !ev.finish_time) {
                alert("Missing fields"); return;
            }


            // 2. Validate Rules (Non-Manager)
            if (!isManager) {
                const dateObj = new Date(ev.date);
                const day = dateObj.getDay(); // 0=Sun, 6=Sat
                const isWeekend = day === 0 || day === 6;
                const isHoliday = holidays.some(h => h.date === ev.date);

                const timeToDec = (t: string) => {
                    const [h, m] = t.split(':').map(Number);
                    return h + m / 60;
                };
                const startDec = timeToDec(ev.start_time);
                const finishDec = timeToDec(ev.finish_time);

                // Rule 1: Leaves (TOIL, PAID, SICK, MARRIAGE)
                // - Weekdays only (Mon-Fri)
                // - 08:15 - 16:30
                // - Not on Holidays
                if (['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(ev.type)) {
                    if (isWeekend || isHoliday) {
                        alert(`${ev.type} is only allowed on Weekdays (excluding Holidays).`);
                        return;
                    }
                    // Check time range (must be within 08:15 - 16:30)
                    // 08:15 = 8.25, 16:30 = 16.5
                    if (startDec < 8.25 || finishDec > 16.5) {
                        alert(`${ev.type} must be between 08:15 and 16:30.`);
                        return;
                    }
                }

                // Rule 2: OT / ONCALL
                // - Allowed anytime on Weekends / Holidays
                // - On Weekdays: Allowed 00:00-08:15 OR 16:30-23:59
                //   (Strictly NO overlap with 08:15-16:30)
                if (['OVERTIME', 'ONCALL'].includes(ev.type)) {
                    if (!isWeekend && !isHoliday) {
                        // Weekday check: Must NOT touch 08:15 - 16:30
                        // Valid if: finish <= 08:15 OR start >= 16:30
                        const isMorning = finishDec <= 8.25;
                        const isEvening = startDec >= 16.5;

                        if (!isMorning && !isEvening) {
                            alert(`${ev.type} on Weekdays is only allowed before 08:15 or after 16:30.`);
                            return;
                        }
                    }
                }

                // Rule 3: Mutual Exclusion (Leaves vs Overtime)
                const isLeave = ['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(ev.type);
                const isOvertime = ev.type === 'OVERTIME';

                if (isLeave || isOvertime) {
                    const hasConflict = allEvents.some(other => {
                        if (other.id === ev.id) return false;
                        if (other.employee_name !== ev.employee_name) return false;
                        if (other.date !== ev.date) return false;
                        if (other.situation === 'Deleted') return false;

                        const otherIsLeave = ['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(other.type);
                        const otherIsOvertime = other.type === 'OVERTIME';

                        if (isLeave && otherIsOvertime) return true;
                        if (isOvertime && otherIsLeave) return true;
                        return false;
                    });

                    if (hasConflict) {
                        alert("Cannot have Overtime and Leave (TOIL/Paid/Sick/Marriage) on the same day.");
                        return;
                    }
                }

                // Rule 4: Past/Current Month Validation
                const today = new Date();
                const eventDate = new Date(`${ev.date}T00:00:00`); // Ensure local date match

                if (ev.type === 'OVERTIME') {
                    // OT: Strictly Past
                    const eventDateTime = new Date(`${ev.date}T${ev.start_time}`);
                    if (eventDateTime > today) {
                        alert(`${ev.type} can only be entered for past dates and times.`);
                        return;
                    }
                }

                if (['SICK', 'SICK CERTIFIED', 'BEREAVEMENT'].includes(ev.type)) {
                    // Sick/Bereavement: Cannot be for future months
                    // (Allowed: Past months, Current Month including future dates in it)
                    const isFutureMonth = eventDate.getFullYear() > today.getFullYear() ||
                        (eventDate.getFullYear() === today.getFullYear() && eventDate.getMonth() > today.getMonth());

                    if (isFutureMonth) {
                        alert(`${ev.type} cannot be entered for future months.`);
                        return;
                    }
                }
            }

            // 3. Overlap
            if (checkOverlap(ev)) {
                alert("Overlap detected"); return;
            }

            // 3. Balance Check (TOIL/PAID)
            if (ev.type === 'TOIL' || ev.type === 'PAID') {
                const y = parseInt(ev.date.split('-')[0], 10);
                const original = allEvents.find(e => e.id === ev.id); // Check against DB
                let currentBalance;
                if (ev.type === 'TOIL') currentBalance = calcOtRemaining(allEvents, yearlyData, ev.employee_name, y);
                else currentBalance = calcPaidRemaining(allEvents, yearlyData, ev.employee_name, y);

                if (original && original.type === ev.type && original.situation !== 'Deleted') {
                    // If updating existing event, add back its duration
                    currentBalance += (original.duration_hour || 0);
                }

                if (currentBalance - (ev.duration_hour || 0) < 0) {
                    alert("Insufficient Balance"); // Concise for now
                    return;
                }
            }

            // Save
            let situation = ev.situation;
            if (ev.isNew) {
                situation = 'Added';
            } else if (ev.situation === 'Approved') {
                situation = 'Updated';
            }
            // If 'Added', stays 'Added'. If 'Updated', stays 'Updated'.

            let toSave: any = { ...ev, situation };
            if (ev.isNew) {
                const { id: tmpId, isNew, ...rest } = toSave;
                toSave = rest;
            }

            await saveBatch([toSave]);

            // Cleanup State
            setNewEvents(prev => prev.filter(e => e.id !== id));
            setEditingRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            setDirtyRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            if (gridSelection.has(id)) toggleGridSelection(id);
        } catch (error: any) {
            console.error("Commit Failed:", error);
            alert("Failed to commit: " + error.message);
        }
    };

    const handleApproveRow = (row: Event) => {
        if (!confirm(`Approve event for ${row.employee_name}?`)) return;
        performApprove([row.id]);
    };

    const handleRejectRow = (row: Event) => {
        if (!confirm(`Reject event for ${row.employee_name}?`)) return;
        performReject([row.id]);
    };


    const handleRollbackEdit = (id: number | string) => {
        const isNew = String(id).startsWith('temp-');
        if (isNew) {
            // For new rows, rollback resets to initial 'empty' state from newEvents
            const original = newEvents.find(e => e.id === id);
            if (original) setEditingEvents(prev => ({ ...prev, [id]: { ...original } }));
        } else {
            // For existing rows, rollback resets to DB state from visibleEvents
            const original = visibleEvents.find(e => e.id === id);
            if (original) setEditingEvents(prev => ({ ...prev, [id]: { ...original } }));
        }
    };

    const handleCancelRow = (id: number | string) => {
        setEditingRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setDirtyRowIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setGridSelection(prev => { const n = new Set(prev); n.delete(id); return n; }); // Uncheck row
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: removed, ...rest } = editingEvents;
        setEditingEvents(rest);
        setNewEvents(prev => prev.filter(e => e.id !== id));
    };

    const combinedList = [...newEvents, ...visibleEvents];
    // Admin Override: Admins can edit Locked Years
    const isLocked = LOCKED_YEARS.includes(selectedYear) && !currentUser.is_admin;

    const pendingStates = ['Added', 'Updated', 'Deleted'];

    const actionableRows = isManager
        ? combinedList.filter(r => r.situation && pendingStates.includes(r.situation) && (currentUser.is_admin || !isSelfEvent(r)))
        : combinedList.filter(r => !r.situation || !pendingStates.includes(r.situation));

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setGridSelection(new Set(actionableRows.map(r => r.id)));
        } else {
            setGridSelection(new Set());
        }
    };

    return (
        <div className={styles.historyRow}>
            <h3 className={styles.historyHeader}>Events Details {MONTHS[month]} {selectedYear}</h3>
            <div className={styles.historyGridContainer}>

                <table className={styles.historyTable}>
                    <thead>
                        <tr className={styles.tableHeadRow}>
                            <th className={styles.tableCell} style={{ width: 30, textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={actionableRows.length > 0 && gridSelection.size === actionableRows.length}
                                    onChange={handleSelectAll}
                                    disabled={actionableRows.length === 0}
                                />
                            </th>
                            <th className={styles.tableCell} style={{ width: '1%', whiteSpace: 'nowrap' }}>
                                {isManager ? (
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <button className={`${styles.rowActionBtn} ${styles.approveBtn}`} onClick={handleBatchApprove} disabled={isLocked || gridSelection.size === 0}>Approve</button>
                                        <button className={`${styles.rowActionBtn} ${styles.rejectBtn}`} onClick={handleBatchReject} disabled={isLocked || gridSelection.size === 0}>Reject</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <div style={{ position: 'relative' }}
                                            onMouseEnter={() => setShowAddMenu(true)}
                                            onMouseLeave={() => setShowAddMenu(false)}>
                                            <button className={`${styles.toolbarBtn} ${styles.addBtn}`}
                                                disabled={isLocked}
                                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.75rem' }}>
                                                Add
                                            </button>
                                            {showAddMenu && !isLocked && (
                                                <div className={styles.addMenu} style={{
                                                    position: 'absolute', top: '100%', left: 0, zIndex: 10,
                                                    background: 'white', border: '1px solid #ccc', borderRadius: '5px',
                                                    width: '120px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                                }}>
                                                    <div className={styles.addMenuItem} onClick={handleAddEvent}>Individual</div>
                                                    <div className={styles.addMenuItem} onClick={handleOpenRecurrence}>Recurrent</div>
                                                </div>
                                            )}
                                        </div>
                                        <button className={`${styles.toolbarBtn} ${styles.updateBtn}`} onClick={handleBatchUpdate} disabled={isLocked || gridSelection.size === 0} style={{ margin: 0, padding: '4px 8px', fontSize: '0.75rem' }}>Update</button>
                                        <button className={`${styles.toolbarBtn} ${styles.deleteBtn}`} onClick={handleBatchDelete} disabled={isLocked || gridSelection.size === 0} style={{ margin: 0, padding: '4px 8px', fontSize: '0.75rem' }}>Delete</button>
                                    </div>
                                )}
                            </th>
                            <th className={styles.tableCell}>Situation</th>
                            {isManager && <th className={styles.tableCell}>Employee</th>}
                            <th className={styles.tableCell}>Type</th>
                            <th className={styles.tableCell}>Status</th>
                            <th className={styles.tableCell}>Date</th>
                            <th className={styles.tableCell}>Start</th>
                            <th className={styles.tableCell}>Finish</th>
                            <th className={styles.tableCell}>Duration</th>
                            <th className={styles.tableCell}>Comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {combinedList.map(row => {
                            const id = row.id;
                            const isEditing = editingRowIds.has(id);
                            // const isDirty = dirtyRowIds.has(id); // Unused
                            const data = isEditing ? editingEvents[id] : row;

                            let rowClass = getEventColorClass(data.type, data.status, false);
                            if (data.situation && ['Added', 'Updated', 'Deleted'].includes(data.situation)) {
                                rowClass += ` ${data.situation}`;
                            }

                            const isAdded = data.situation === 'Added';
                            const isUpdated = data.situation === 'Updated';

                            // Check for field changes
                            let orig: any = {};
                            if (isUpdated && data.original_data) {
                                try {
                                    orig = JSON.parse(data.original_data);
                                } catch (e) {
                                    // ignore
                                }
                            }

                            const isFieldChanged = (field: string, val: any) => {
                                if (isAdded) return true;
                                if (!isUpdated) return false;

                                let valComp = val;
                                let origComp = orig[field];

                                // Time Normalization (HH:MM vs HH:MM:SS)
                                if (['start_time', 'finish_time'].includes(field)) {
                                    // Treat as string comparison, ensuring both are full format or both normalized?
                                    // User wants hh:mm:ss, so let's compare as is.
                                    // However, input might drop seconds if they are 00.
                                    // Let's rely on standard comparison first.
                                    valComp = val;
                                    origComp = orig[field];
                                }

                                // Number Normalization (Duration)
                                if (field === 'duration_hour') {
                                    return Math.abs(Number(valComp) - Number(origComp)) > 0.001;
                                }

                                return valComp != origComp;
                            };

                            const cellClass = (field: string, val: any) => {
                                return isFieldChanged(field, val) ? 'bold-italic' : '';
                            };

                            // Specific check for Date (format might differ?)
                            // Assuming format is consistent YYYY-MM-DD
                            const dateChanged = isUpdated && data.date !== orig.date;

                            const isActionable = isManager
                                ? (data.situation && ['Added', 'Updated', 'Deleted'].includes(data.situation))
                                : (data.situation !== 'Added');

                            const pendingStates = ['Added', 'Updated', 'Deleted'];
                            const isPending = !!(data.situation && pendingStates.includes(data.situation));

                            let checkable = false;
                            if (isManager) {
                                checkable = isPending && !isSelfEvent(data);
                            } else {
                                checkable = !isPending && data.situation !== 'Added';
                            }

                            // Background color class for Situation cell (Global CSS)
                            const sitClass = `situation-${data.situation || 'Approved'}`;

                            return (
                                <tr key={id} className={rowClass}>
                                    <td className={styles.tableCell} style={{ textAlign: 'center' }}>
                                        {checkable && (
                                            <input type="checkbox" checked={gridSelection.has(id)} onChange={() => toggleGridSelection(id)} />
                                        )}
                                    </td>
                                    <td className={styles.tableCell} style={{ whiteSpace: 'nowrap', textDecoration: 'none', fontStyle: 'normal' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', gap: 5 }}>
                                                <button className={`${styles.rowActionBtn} ${styles.commit}`} onClick={() => handleCommitRow(id)}>Commit</button>
                                                <button className={`${styles.rowActionBtn} ${styles.rollback}`} onClick={() => handleRollbackEdit(id)} disabled={data.isNew}>Rollback</button>
                                                <button className={`${styles.rowActionBtn} ${styles.cancel}`} onClick={() => handleCancelRow(id)}>Cancel</button>
                                            </div>
                                        ) : (
                                            isActionable && (
                                                <div style={{ display: 'flex', gap: 5 }}>
                                                    {/* Manager Actions for Pending Events */}
                                                    {isManager && data.situation && pendingStates.includes(data.situation) && (
                                                        // Hide if event owner is the current user (Unless Admin)
                                                        (currentUser.is_admin || !isSelfEvent(data))
                                                    ) && (
                                                            <>
                                                                <button className={`${styles.rowActionBtn} ${styles.approveBtn}`} onClick={() => handleApproveRow(row)}>Approve</button>
                                                                <button className={`${styles.rowActionBtn} ${styles.rejectBtn}`} onClick={() => handleRejectRow(row)}>Reject</button>
                                                            </>
                                                        )}
                                                </div>
                                            )
                                        )}
                                    </td>

                                    {/* Situation Column */}
                                    <td className={`${styles.tableCell} ${sitClass}`} style={{ textAlign: 'center', textDecoration: 'none', fontStyle: 'normal', fontWeight: 'normal' }}>
                                        {data.situation || 'Approved'}
                                    </td>

                                    {isManager && <td className={`${styles.tableCell} ${isAdded ? 'bold-italic' : ''}`}>
                                        {isEditing && isAdded ? (
                                            <select
                                                className={styles.gridInput}
                                                value={data.employee_id || ''}
                                                onChange={(e) => handleEmployeeChange(id, Number(e.target.value))}
                                                style={{ width: '100%' }}
                                            >
                                                <option value="">Select Employee</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            formatEmployeeName(data.employee_name)
                                        )}
                                    </td>}

                                    {/* Type */}
                                    <td className={`${styles.tableCell} ${cellClass('type', data.type)} ${getEventColorClass(data.type, data.status)}`}>
                                        {isEditing ? (
                                            <select className={styles.gridInput} value={data.type} onChange={(e) => handleFieldChange(id, 'type', e.target.value)}>
                                                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        ) : data.type}
                                    </td>

                                    {/* Status - Auto Derived (Read Only) */}
                                    <td className={`${styles.tableCell} ${cellClass('status', data.status)} ${getEventColorClass(data.type, data.status)}`}>
                                        {data.status}
                                    </td>

                                    {/* Date */}
                                    <td className={`${styles.tableCell} ${isAdded || dateChanged ? 'bold-italic' : ''}`}>
                                        {isEditing ? (
                                            <input type="date" className={styles.gridInput} value={data.date} onChange={(e) => handleFieldChange(id, 'date', e.target.value)} />
                                        ) : data.date}
                                    </td>

                                    {/* Start */}
                                    <td className={`${styles.tableCell} ${cellClass('start_time', data.start_time)}`}>
                                        {isEditing ? (
                                            <input type="time" step="1" className={styles.gridInput} value={data.start_time} onChange={(e) => handleFieldChange(id, 'start_time', e.target.value)} />
                                        ) : (data.start_time || '')}
                                    </td>

                                    {/* Finish */}
                                    <td className={`${styles.tableCell} ${cellClass('finish_time', data.finish_time)}`}>
                                        {isEditing ? (
                                            <input type="time" step="1" className={styles.gridInput} value={data.finish_time} onChange={(e) => handleFieldChange(id, 'finish_time', e.target.value)} />
                                        ) : (data.finish_time || '')}
                                    </td>

                                    <td className={`${styles.tableCell} ${cellClass('duration_hour', data.duration_hour)}`}>{formatHours(data.duration_hour)}</td>

                                    {/* Comment */}
                                    <td className={`${styles.tableCell} ${cellClass('comment', data.comment)}`}>
                                        {isEditing ? (
                                            <input type="text" className={styles.gridInput} value={data.comment || ''} onChange={(e) => handleFieldChange(id, 'comment', e.target.value)} />
                                        ) : data.comment}
                                    </td>
                                </tr>
                            );
                        })}
                        {combinedList.length === 0 && <tr><td colSpan={11} className={styles.tableCell} style={{ textAlign: 'center' }}>No events</td></tr>}
                    </tbody>
                </table>
            </div>

            <RecurrenceModal
                isOpen={showRecurrenceModal}
                onClose={() => setShowRecurrenceModal(false)}
                onSave={handleSaveRecurrence}
                initialData={recurrenceData}
                selectedYear={selectedYear}
                month={month}
                currentUser={currentUser}
                holidays={holidays}
                existingEvents={combinedList}
            />
        </div >
    );
};

export default Events;
