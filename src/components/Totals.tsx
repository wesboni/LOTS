import React from 'react';
import styles from './Totals.module.css';
import { Event, YearlyBalance } from '../types';
import {
    getOtCarryOver, calcOtRemaining, getPaidCarryOver, calcPaidRemaining,
    getSum, getBalanceValue, getEventColorClass, formatHours,
    getDerivedType, MONTHS, formatEmployeeName
} from '../utils';

interface TotalsProps {
    viewMode: 'yearly' | 'monthly';
    year: number;
    month: number;
    events: Event[];
    yearlyData: YearlyBalance[];
    visibleEmployees: string[];
    selectedEmployees: Set<string>;
    isManager: boolean;
    // Monthly Props
    selectedFilters?: Set<string>;
    onToggleFilter?: (type: string, status: string) => void;
    onToggleEmployee?: (emp: string) => void;
}

const Totals: React.FC<TotalsProps> = ({
    viewMode,
    year,
    month,
    events,
    yearlyData,
    visibleEmployees,
    selectedEmployees,
    isManager,
    selectedFilters,
    onToggleFilter,
    onToggleEmployee
}) => {

    const isYearly = viewMode === 'yearly';

    // Helper to determine if a row should be shown
    const shouldShow = (row: any) => {
        if (row.showIn === 'yearly' && !isYearly) return false;
        if (row.showIn === 'monthly' && isYearly) return false;
        return true;
    };

    // Configuration for Rows
    const sections = [
        {
            title: 'Overtime',
            headerColor: '', // default grey
            rows: [
                { type: 'calc', label: 'Carry Over', valFn: getOtCarryOver, color: 'row-grey', showIn: 'yearly' },
                { t: 'OVERTIME', s: 'Earned', color: 'overtime-bg' }, // Salmon
                { t: 'TOIL', s: 'Taken', color: 'toil-taken-bg' },
                { t: 'TOIL', s: 'Planned', color: 'toil-planned-bg' },
                { type: 'calc', label: 'Remaining', valFn: calcOtRemaining, color: 'row-grey', showIn: 'yearly' }
            ]
        },
        {
            title: 'Paid Leave',
            rows: [
                { type: 'calc', label: 'Carry Over', valFn: getPaidCarryOver, color: 'row-grey', showIn: 'yearly' },
                { type: 'bal', label: 'Entitlement', field: 'entitlement', color: 'row-grey', showIn: 'yearly' },
                { type: 'bal', label: 'Adjustment', field: 'adjustment', color: 'row-grey', showIn: 'yearly' },
                { t: 'PAID', s: 'Taken', color: 'paid-taken-bg' },
                { t: 'PAID', s: 'Planned', color: 'paid-planned-bg' }, // Or just 'paid-planned-bg' logic?
                { type: 'calc', label: 'Remaining', valFn: calcPaidRemaining, color: 'row-grey', showIn: 'yearly' }
            ]
        },
        {
            title: 'Other Leaves',
            rows: [
                { t: 'SICK', s: 'Taken', color: 'sick-bg' },
                { t: 'BEREAVEMENT', s: 'Taken', color: 'bereavement-bg' },
                { t: 'MARRIAGE', s: 'Taken', color: 'marriage-bg' }, // Using global class if exists? marriage-bg is defined.
                { t: 'MARRIAGE', s: 'Planned', color: 'marriage-planned-bg' }
            ]
        },
        {
            title: 'Others',
            rows: [
                { t: 'ONCALL', s: 'Done', color: 'oncall-done-bg' },
                { t: 'ONCALL', s: 'Planned', color: 'oncall-planned-bg' }
            ]
        }
    ];

    // Grid Template: [Checkbox 30px] [Type 100px] [Status 100px] [Emp1 1fr/80px] ... [Total 100px]
    // const gridTemplate = `30px 100px 100px repeat(${visibleEmployees.length}, ${isManager ? '1fr' : 'max-content'}) ${isManager ? '100px' : ''}`;

    const title = isYearly ? `Yearly Totals: ${year}` : `Monthly Totals: ${MONTHS[month]} ${year}`;

    return (
        <div className={`${styles.totalsContainer} ${isManager ? styles.managerView : ''}`}>
            <h3 className={styles.totalsHeader}>{title}</h3>
            <div className={styles.totalsTableWrapper}>
                <table className={styles.totalsTable}>
                    <thead>
                        {/* Master Header Row */}
                        <tr className={styles.totalsRow}>
                            {/* Checkbox Placeholder */}
                            <th className={`${styles.totalsCell} ${styles.headerCell}`}></th>
                            <th className={`${styles.totalsCell} ${styles.headerCell}`}>Type</th>
                            <th className={`${styles.totalsCell} ${styles.headerCell}`}>Status</th>

                            {visibleEmployees.map(e => (
                                <th key={e} className={`${styles.totalsCell} ${styles.headerCell}`} style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedEmployees.has(e)}
                                            onChange={() => onToggleEmployee && onToggleEmployee(e)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        {formatEmployeeName(e)}
                                    </div>
                                </th>
                            ))}

                            {isManager && <th className={`${styles.totalsCell} ${styles.headerCell}`}>Grand Total</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Sections */}
                        {sections.map((section, sIdx) => (
                            <React.Fragment key={sIdx}>
                                {/* Section Header */}
                                <tr className={styles.sectionHeaderRow}>
                                    <td colSpan={visibleEmployees.length + (isManager ? 4 : 3)} className={styles.sectionHeaderCell}>
                                        {section.title}
                                    </td>
                                </tr>

                                {section.rows.filter(shouldShow).map((r: any, rIdx: number) => {
                                    const isCalc = r.type === 'calc';
                                    const isBal = r.type === 'bal';
                                    let typeLabel = r.t || '';
                                    let statusLabel = r.s || '';
                                    if (isCalc || isBal) {
                                        typeLabel = r.label;
                                    }

                                    let colorClass = r.color;
                                    if (!colorClass && r.t && r.s) {
                                        colorClass = getEventColorClass(r.t, r.s).replace('row-', '').replace('-bg', '');
                                    }
                                    if (!colorClass) colorClass = '';

                                    const filterKey = `${r.t}|${r.s}`;
                                    const isFilterable = !isCalc && !isBal && !isYearly;
                                    const isChecked = isFilterable && selectedFilters?.has(filterKey);

                                    return (
                                        <tr key={`${sIdx}-${rIdx}`} className={`${styles.totalsRow} ${colorClass}`}>
                                            {/* 1. Checkbox */}
                                            <td className={`${styles.totalsCell} ${colorClass}`} style={{ textAlign: 'center' }}>
                                                {isFilterable && (
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => onToggleFilter && onToggleFilter(r.t, r.s)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                )}
                                            </td>

                                            {/* 2. Type */}
                                            <td className={`${styles.totalsCell} ${colorClass}`}>{typeLabel}</td>

                                            {/* 3. Status */}
                                            <td className={`${styles.totalsCell} ${colorClass}`}>{statusLabel}</td>

                                            {/* 4. Employee Values */}
                                            {visibleEmployees.map(e => {
                                                if (!selectedEmployees.has(e)) {
                                                    return <td key={e} className={`${styles.totalsCell} ${colorClass}`} style={{ textAlign: 'center', opacity: 0.5 }}>-</td>;
                                                }

                                                let val: any = 0;
                                                if (isCalc) {
                                                    val = r.valFn(events, yearlyData, e, year);
                                                } else if (isBal) {
                                                    val = getBalanceValue(yearlyData, e, year, r.field);
                                                } else {
                                                    if (isYearly) {
                                                        val = getSum(events, e, year, r.t, r.s);
                                                    } else {
                                                        val = events.filter(ev => {
                                                            if (['Added', 'Updated', 'Deleted'].includes(ev.situation || '')) return false;
                                                            const [yStr, mStr] = (ev.date || '').split('-');
                                                            const inScope = (Number(yStr) === year && (Number(mStr) - 1) === month);
                                                            return inScope && ev.employee_name === e && getDerivedType(ev) === r.t && ev.status === r.s;
                                                        }).reduce((acc, curr) => acc + (curr.duration_hour || 0), 0);
                                                    }
                                                }

                                                return <td key={e} className={`${styles.totalsCell} ${colorClass}`} style={{ textAlign: 'right' }}>{typeof val === 'number' ? formatHours(val) : val}</td>;
                                            })}

                                            {/* 5. Grand Total */}
                                            {isManager && <td className={`${styles.totalsCell} ${colorClass}`} style={{ textAlign: 'right', fontWeight: 700 }}>
                                                {formatHours(visibleEmployees.filter(e => selectedEmployees.has(e)).reduce((acc, empName) => {
                                                    let v: any = 0;
                                                    if (isCalc) v = r.valFn(events, yearlyData, empName, year);
                                                    else if (isBal) v = getBalanceValue(yearlyData, empName, year, r.field);
                                                    else {
                                                        if (isYearly) v = getSum(events, empName, year, r.t, r.s);
                                                        else {
                                                            v = events.filter(ev => {
                                                                if (['Added', 'Updated', 'Deleted'].includes(ev.situation || '')) return false;
                                                                const [yStr, mStr] = (ev.date || '').split('-');
                                                                const inScope = (Number(yStr) === year && (Number(mStr) - 1) === month);
                                                                return inScope && ev.employee_name === empName && getDerivedType(ev) === r.t && ev.status === r.s;
                                                            }).reduce((acc2, curr) => acc2 + (curr.duration_hour || 0), 0);
                                                        }
                                                    }
                                                    return acc + (Number(v === '-' ? 0 : v) || 0);
                                                }, 0))}
                                            </td>}
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Totals;
