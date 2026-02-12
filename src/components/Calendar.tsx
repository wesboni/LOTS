import React from 'react';
import styles from './Calendar.module.css';
import { Event, Holiday } from '../types';
import { DAYS, getDerivedType, deriveStatus, getEventColorClass, SHORT, formatHours, MONTHS, formatEmployeeName } from '../utils';

interface CalendarProps {
    year: number;
    month: number;
    events: Event[];
    holidays: Holiday[];
    selectedEmployees: Set<string>;
    selectedFilters: Set<string>;
    isManager: boolean;
}

const Calendar: React.FC<CalendarProps> = ({
    year,
    month,
    events,
    holidays,
    selectedEmployees,
    selectedFilters,
    isManager
}) => {

    const renderGrid = () => {
        return Array.from({ length: 42 }).map((_, i) => {
            const firstDayOfMonth = new Date(year, month, 1).getDay();
            const adjFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
            const dayNum = i - adjFirstDay + 1;
            const date = new Date(year, month, dayNum);
            const isCurrentMonth = date.getMonth() === month;
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

            if (!isCurrentMonth) return <div key={i} className={`${styles.calendarGridCell} ${styles.empty}`}></div>;

            // Filter events for this day
            const dayEvents = events.filter(e => {
                const dType = getDerivedType(e);
                const dStatus = deriveStatus(dType, e.date, e.finish_time);
                const filterKey = `${dType}|${dStatus}`;
                const match = e.date === dateStr &&
                    selectedEmployees.has(e.employee_name) &&
                    selectedFilters.has(filterKey);

                return match;
            }).sort((a, b) => {
                const empDiff = a.employee_name.localeCompare(b.employee_name);
                if (empDiff !== 0) return empDiff;
                const timeDiff = (a.start_time || '').localeCompare(b.start_time || '');
                if (timeDiff !== 0) return timeDiff;
                return (a.type || '').localeCompare(b.type || '');
            });

            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = holidays.find(h => h.date === dateStr);

            return (
                <div key={i} className={`${styles.calendarGridCell} ${isWeekend ? styles.weekendCell : ''} ${isHoliday ? styles.holidayCell : ''}`}>
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
                    <div className={styles.slotList}>
                        {dayEvents.map(ev => {
                            let colorClass = getEventColorClass(ev.type, ev.status);
                            if (ev.situation && ['Added', 'Updated', 'Deleted'].includes(ev.situation)) {
                                // logic: Append situation class to base color class
                                colorClass += ` ${ev.situation}`;
                            }

                            const formatTime = (t: string) => (t || '').substring(0, 5);

                            const isAdded = ev.situation === 'Added';
                            const isUpdated = ev.situation === 'Updated';
                            let orig: any = {};
                            if (isUpdated && ev.original_data) {
                                try { orig = JSON.parse(ev.original_data); } catch (e) { }
                            }

                            const isDeleted = ev.situation === 'Deleted';

                            const isDiff = (field: string, val: any) => {
                                if (isAdded || isDeleted) return false; // Handled by container style or ignored
                                if (!isUpdated) return false;
                                let v = val;
                                let o = field === 'duration_hour' ? (orig.duration || orig.duration_hour) : orig[field];

                                // Normalize strings for Time/Type
                                if (['start_time', 'finish_time'].includes(field)) {
                                    v = (String(v || '')).substring(0, 5);
                                    o = (String(o || '')).substring(0, 5);
                                } else if (field === 'type') {
                                    v = String(v || '');
                                    o = String(o || '');
                                }
                                return v != o;
                            };

                            const wrap = (text: string, changed: boolean) => changed ? <b style={{ fontWeight: 'bold' }}>{text}</b> : text;

                            const typeShort = SHORT[ev.type] || ev.type;
                            const start = formatTime(ev.start_time);
                            const finish = formatTime(ev.finish_time);
                            const timeChanged = isDiff('start_time', ev.start_time) || isDiff('finish_time', ev.finish_time);

                            // Determine dot class
                            let dotClass = styles.statusApproved;
                            if (isAdded) dotClass = styles.statusAdded;
                            else if (isUpdated) dotClass = styles.statusUpdated;
                            else if (isDeleted) dotClass = styles.statusDeleted;

                            // Situation Specific Text Styles
                            const slotStyle: React.CSSProperties = {};
                            if (isDeleted) {
                                slotStyle.textDecoration = 'line-through';
                                slotStyle.fontStyle = 'normal';
                                slotStyle.fontWeight = 'normal';
                            } else if (isAdded) {
                                slotStyle.fontWeight = 'bold'; // Extra bold
                            } else {
                                // Approved or Updated (base text normal, updated fields bolded by wrap)
                                slotStyle.fontStyle = 'normal';
                                slotStyle.fontWeight = 'normal';
                                slotStyle.textDecoration = 'none';
                            }

                            return (
                                <div key={ev.id} className={`${styles.slot} ${colorClass}`} style={slotStyle}>
                                    <div className={`${styles.statusDot} ${dotClass}`} title={ev.situation || 'Approved'}></div>
                                    {isManager && `${formatEmployeeName(ev.employee_name)} : `}
                                    {wrap(typeShort, isDiff('type', ev.type))} : {wrap(`${start}-${finish}`, timeChanged)} ({wrap(formatHours(ev.duration_hour), timeChanged)})
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        });
    };

    return (
        <div className={styles.calendarGridSection}>
            <h3 className={styles.calendarHeader}>Calendar Details: {MONTHS[month]} {year}</h3>
            <div className={styles.calendarGridContainer}>
                <div className={styles.calendarGrid}>
                    {DAYS.map(d => <div key={d} className={`${styles.calendarGridCell} ${styles.dayName}`}>{d}</div>)}
                    {renderGrid()}
                </div>
            </div>
        </div>
    );
};

export default Calendar;
