import React, { useState, useEffect } from 'react';
import styles from './RecurrenceModal.module.css';
import { EVENT_TYPES } from '../utils';

interface RecurrenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => void;
    initialData?: any;
    selectedYear: number;
    month: number;
    currentUser: any;
    holidays: any[];
    existingEvents: any[];
}

const DAYS = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 },
];

const RecurrenceModal: React.FC<RecurrenceModalProps> = (props) => {
    const { isOpen, onClose, onSave, initialData, selectedYear, month, currentUser, holidays, existingEvents } = props;
    const [type, setType] = useState('TOIL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [finishTime, setFinishTime] = useState('17:00');
    const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            // Defaults or Initial Data
            if (initialData) {
                setType(initialData.type);
                setStartDate(initialData.start_date);
                setEndDate(initialData.end_date);
                setStartTime(initialData.start_time);
                setFinishTime(initialData.finish_time);
                // days_of_week string "1,3,5" -> Set
                if (initialData.days_of_week) {
                    setSelectedDays(new Set(initialData.days_of_week.split(',').map(Number)));
                }
            } else {
                // Default Start: First of current view month
                const y = selectedYear;
                const m = month + 1;
                const sStr = `${y}-${String(m).padStart(2, '0')}-01`;
                setStartDate(sStr);

                // Default End: End of current view month (Constraint)
                const lastDay = new Date(y, m, 0).getDate();
                const eStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                setEndDate(eStr);

                setType('TOIL');
                setStartTime('08:30:00');
                setFinishTime('16:30:00');
                setSelectedDays(new Set());
            }
        }
    }, [isOpen, initialData, selectedYear, month]);

    const handleDayToggle = (d: number) => {
        const next = new Set(selectedDays);
        if (next.has(d)) next.delete(d); else next.add(d);
        setSelectedDays(next);
    };

    const handleSave = () => {
        // Validation
        if (!startDate || !endDate || !startTime || !finishTime || selectedDays.size === 0) {
            alert("Please fill all fields and select at least one day.");
            return;
        }

        // Constraint: End Date <= End of Start Date's Month
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);

        if (ey > sy || (ey === sy && em > sm)) {
            alert("End date cannot exceed the end of the start month.");
            return;
        }

        // 3. Validation: Check if ANY days verify & Apply Rules
        const start = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);

        // Helper for Time
        const timeToDec = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h + m / 60;
        };
        const startDec = timeToDec(startTime);
        const finishDec = timeToDec(finishTime);
        const today = new Date();

        let found = false;

        // Loop generated dates for validation
        // We create a temp date iterator
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const day = d.getDay(); // 0=Sun
            if (!selectedDays.has(day)) continue;

            found = true;

            // Format YYYY-MM-DD
            const y = d.getFullYear();
            const mStr = String(d.getMonth() + 1).padStart(2, '0');
            const dStr = String(d.getDate()).padStart(2, '0');
            const dateStr = `${y}-${mStr}-${dStr}`;

            const isWeekend = day === 0 || day === 6;
            const isHoliday = (holidays || []).some((h: any) => h.date === dateStr);

            // Rule 1: Leaves (Weekdays 08:15-16:30)
            if (['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(type)) {
                if (isWeekend || isHoliday) {
                    alert(`${type} is only allowed on Weekdays (excluding Holidays).\nInvalid Date: ${dateStr}`);
                    return;
                }
                if (startDec < 8.25 || finishDec > 16.5) {
                    alert(`${type} must be between 08:15 and 16:30.\nInvalid Date: ${dateStr}`);
                    return;
                }
            }

            // Rule 2: OT / ONCALL
            if (['OVERTIME', 'ONCALL'].includes(type)) {
                if (!isWeekend && !isHoliday) {
                    const isMorning = finishDec <= 8.25;
                    const isEvening = startDec >= 16.5;
                    if (!isMorning && !isEvening) {
                        alert(`${type} on Weekdays is only allowed before 08:15 or after 16:30.\nInvalid Date: ${dateStr}`);
                        return;
                    }
                }
            }

            // Rule 3: Mutual Exclusion
            // Check against existingEvents (excluding self if editing)
            const exists = (existingEvents || []).find((e: any) => {
                if (initialData && e.id === initialData.id) return false; // Skip self? 
                // Wait, initialData.id is the RECURRENCE ID or Event ID?
                // If editing series, 'initialData' might be the recurrence object or a representative event?
                // Passing 'id' in data implies we are editing the *Recurrence*.
                // The 'existingEvents' list contains individual events.
                // If we are editing the series, we should ignore events FROM THIS SERIES.
                if (initialData && e.recurrence_id === initialData.id) return false;

                return e.date === dateStr && e.employee_id === currentUser.employee_id && e.situation !== 'Deleted';
            });

            if (exists) {
                // Check conflict types
                const isLeave = ['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(type);
                const isOvertime = type === 'OVERTIME';
                const otherType = exists.type;
                const otherIsLeave = ['TOIL', 'PAID', 'SICK', 'MARRIAGE'].includes(otherType);
                const otherIsOvertime = otherType === 'OVERTIME';

                if ((isLeave && otherIsOvertime) || (isOvertime && otherIsLeave)) {
                    alert(`Cannot have Overtime and Leave on the same day (${dateStr}).`);
                    return;
                }

                // Allow same-type overlap? (e.g. 2 OT slots). 
                // Events.tsx generic overlap check handles time overlaps.
                // Explicit "Leave vs OT" rule is distinct.
            }

            // Rule 4: Past/Future
            const eventDate = new Date(`${dateStr}T00:00:00`);
            if (type === 'OVERTIME') {
                // Check if actually future. 
                const eventDateTime = new Date(`${dateStr}T${startTime}`);
                if (eventDateTime > today) {
                    alert(`${type} can only be entered for past dates and times.\nInvalid: ${dateStr}`);
                    return;
                }
            }
            if (['SICK', 'SICK CERTIFIED', 'BEREAVEMENT'].includes(type)) {
                const isFutureMonth = eventDate.getFullYear() > today.getFullYear() ||
                    (eventDate.getFullYear() === today.getFullYear() && eventDate.getMonth() > today.getMonth());
                if (isFutureMonth) {
                    alert(`${type} cannot be entered for future months.\nInvalid: ${dateStr}`);
                    return;
                }
            }
        }

        if (!found) {
            alert("No events will be generated with the selected dates and weekdays.");
            return;
        }

        const data = {
            id: initialData ? initialData.id : undefined, // Pass ID if editing
            employee_id: currentUser.employee_id,
            type,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime,
            finish_time: finishTime,
            days_of_week: Array.from(selectedDays).join(','),
            situation: 'Added'
        };
        onSave(data);
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <h3>{initialData ? 'Edit Recurrence Series' : 'Add Recurring Event'}</h3>

                <div className={styles.formGroup}>
                    <label>Type</label>
                    <select value={type} onChange={e => setType(e.target.value)}>
                        {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <div className={styles.row}>
                    <div className={styles.formGroup}>
                        <label>Start Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>End Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>

                <div className={styles.row}>
                    <div className={styles.formGroup}>
                        <label>Start Time (hh:mm:ss)</label>
                        <input type="time" step="1" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Finish Time (hh:mm:ss)</label>
                        <input type="time" step="1" value={finishTime} onChange={e => setFinishTime(e.target.value)} />
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Days of Week</label>
                    <div className={styles.daysGrid}>
                        {DAYS.map(day => (
                            <button
                                key={day.value}
                                className={`${styles.dayBtn} ${selectedDays.has(day.value) ? styles.active : ''}`}
                                onClick={() => handleDayToggle(day.value)}
                            >
                                {day.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.actions}>
                    <button className={styles.saveBtn} onClick={handleSave}>Save Series</button>
                    <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default RecurrenceModal;
