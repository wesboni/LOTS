import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './Dashboard.module.css';
import { Event, Holiday, YearlyBalance, User, Employee } from '../types';
import { MONTHS, YEARS, ALL_FILTERS, getDerivedType, deriveStatus } from '../utils';

// Sub-components
import Totals from './Totals';
import Calendar from './Calendar'; // The Grid (formerly CalendarGrid)
import Events from './Events';

interface DashboardProps {
    currentUser: User;
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser }) => {
    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [currentDate, setCurrentDate] = useState<Date>(new Date(selectedYear, new Date().getMonth(), 1));
    const month = currentDate.getMonth();

    const [viewMode, setViewMode] = useState<'yearly' | 'monthly'>('monthly');

    const [events, setEvents] = useState<Event[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]); // API Only
    const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
    const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(ALL_FILTERS));
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [yearlyData, setYearlyData] = useState<YearlyBalance[]>([]);

    const [isDirty, setIsDirty] = useState(false);

    // RBAC & View Switching
    // Default to Manager View if they have it, otherwise Employee
    const [activeView, setActiveView] = useState<'Manager' | 'Employee'>(
        currentUser.is_manager ? 'Manager' : 'Employee'
    );

    // Effect to reset view if user changes (e.g. login/logout unlikely here but good practice)
    useEffect(() => {
        setActiveView(currentUser.is_manager ? 'Manager' : 'Employee');
    }, [currentUser]);

    const isManagerMode = activeView === 'Manager';

    // Debug State
    const [debugError, setDebugError] = useState<string | null>(null);

    // -------------------------------------------------------------------------
    // DATA FETCHING
    // -------------------------------------------------------------------------
    const fetchData = useCallback(async () => {
        setDebugError(null);
        try {
            console.log("Fetching /api/employees...");
            const empRes = await fetch('/api/employees');

            if (!empRes.ok) {
                const text = await empRes.text();
                throw new Error(`API Error: ${empRes.status} ${empRes.statusText} - ${text.substring(0, 100)}`);
            }

            const empJson = await empRes.json();
            console.log("Employees Data:", empJson);

            if (empJson.data && Array.isArray(empJson.data)) {
                const emps: Employee[] = empJson.data;
                setEmployees(emps);

                // Initial Selection Logic dependent on Role ??
                // Keep it simple: select all or just self?
                // For now, select all loaded names
                const names = emps.map(e => e.name);
                setSelectedEmployees(prev => prev.size > 0 ? prev : new Set(names));
            } else {
                throw new Error("Invalid JSON structure for employees");
            }


            // Fetch remaining data
            const [evtRes, yrRes, holRes] = await Promise.all([
                fetch('/api/events'),
                fetch('/api/leave-data'),
                fetch('/api/holidays')
            ]);

            if (!evtRes.ok) throw new Error(`Events API Error: ${evtRes.status} ${evtRes.statusText}`);
            if (!yrRes.ok) throw new Error(`Yearly Data API Error: ${yrRes.status} ${yrRes.statusText}`);
            if (!holRes.ok) throw new Error(`Holidays API Error: ${holRes.status} ${holRes.statusText}`);

            const evtJson = await evtRes.json();
            const yrJson = await yrRes.json();
            const holJson = await holRes.json();

            console.log("Events Data:", evtJson);

            if (evtJson.data) setEvents(evtJson.data);
            if (yrJson.data) setYearlyData(yrJson.data);
            if (holJson.data) setHolidays(holJson.data);

        } catch (err: any) {
            console.error("Fetch Error:", err);
            setDebugError(err.message || String(err));
        }
    }, [currentUser]); // Removed isManager dep

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // -------------------------------------------------------------------------
    // HANDLERS
    // -------------------------------------------------------------------------
    const checkUnsavedChanges = () => {
        if (isDirty) {
            return confirm("You have unsaved changes. Discard?");
        }
        return true;
    };

    const handleSetSelectedYear = (y: number) => {
        if (checkUnsavedChanges()) {
            setSelectedYear(y);
            setCurrentDate(new Date(y, month, 1));
        }
    };

    const handleSetMonth = (idx: number) => {
        if (checkUnsavedChanges()) {
            setCurrentDate(new Date(selectedYear, idx, 1));
        }
    };

    const toggleEmployee = (e: string) => {
        const next = new Set(selectedEmployees);
        if (next.has(e)) next.delete(e); else next.add(e);
        setSelectedEmployees(next);
    };

    const toggleFilter = (t: string, s: string) => {
        const key = `${t}|${s}`;
        const next = new Set(selectedFilters);
        if (next.has(key)) next.delete(key); else next.add(key);
        setSelectedFilters(next);
    };

    const handleViewToggle = (mode: 'yearly' | 'monthly') => {
        if (checkUnsavedChanges()) {
            setViewMode(mode);
        }
    };

    // -------------------------------------------------------------------------
    // DERIVED DATA
    // -------------------------------------------------------------------------

    // 1. Determine which employees are VISIBLE in the grids/lists
    const visibleEmployees = useMemo(() => {
        // If in Employee View (My View), ONLY show self
        if (!isManagerMode) {
            return employees.filter(e => e.name === currentUser.name).map(e => e.name);
        }

        // If in Manager View, check whom they manage
        const managedNames = currentUser.manages || [];

        // Manager should see their own data + their employees' data
        const visibleNames = new Set([...managedNames, currentUser.name]);

        return employees.filter(e => visibleNames.has(e.name)).map(e => e.name);

    }, [employees, isManagerMode, currentUser]);

    // 2. Filter Events for SECURITY/ACCESS
    // (Only events for visible employees should be passed down)
    const accessibleEvents = useMemo(() => {
        const visibleNames = new Set(visibleEmployees);
        return events.filter(e => visibleNames.has(e.employee_name));
    }, [events, visibleEmployees]);


    // Filtered Events for Events Component (History)
    const filteredHistoryEvents = useMemo(() => {
        return accessibleEvents.filter(e => {
            if (!e.date) return false;
            const [yStr, mStr] = e.date.split('-').map(Number);
            const isYearMatch = yStr === selectedYear;
            const isMonthMatch = (mStr - 1) === month;

            // Use visibleEmployees to validate selection for security/consistency
            // But also respect selectedEmployees (checkboxes)
            // For non-manager, visibleEmployees has only them, so selectedEmployees should ideally match.
            const isEmployeeMatch = selectedEmployees.has(e.employee_name);

            const dType = getDerivedType(e);
            let dStatus = e.status;
            if (!dStatus) dStatus = deriveStatus(dType, e.date, e.finish_time);
            const filterKey = `${dType}|${dStatus}`;
            const typeMatch = selectedFilters.has(filterKey);

            return isYearMatch && isMonthMatch && isEmployeeMatch && typeMatch;
        }).sort((a, b) => {
            const da = a.date || '';
            const db = b.date || '';
            if (da !== db) return da.localeCompare(db);
            return (a.start_time || '').localeCompare(b.start_time || '');
        });
    }, [accessibleEvents, selectedYear, month, selectedEmployees, selectedFilters]);

    return (
        <div className={styles.mainLayout}>
            {/* DEBUG BANNER */}
            {debugError && (
                <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', marginBottom: '10px', border: '1px solid #ef9a9a' }}>
                    <strong>DEBUG ERROR:</strong> {debugError}
                </div>
            )}

            {/* View Header / Navigation */}
            <div className={styles.viewHeaderRow}>
                {/* 1. Role View Toggle (Individual / Managerial) */}
                <div className={styles.yearSelector}>
                    {currentUser.is_manager && (
                        <>
                            <button
                                className={!isManagerMode ? styles.active : ''}
                                onClick={() => { if (checkUnsavedChanges()) setActiveView('Employee'); }}
                            >
                                Individual
                            </button>
                            <button
                                className={isManagerMode ? styles.active : ''}
                                onClick={() => { if (checkUnsavedChanges()) setActiveView('Manager'); }}
                            >
                                Managerial
                            </button>
                        </>
                    )}
                    {!currentUser.is_manager && (
                        <button className={styles.active} style={{ cursor: 'default' }}>Individual</button>
                    )}
                </div>

                {/* 2. View Mode Toggle (Yearly / Monthly) */}
                <div className={styles.yearSelector}>
                    <button
                        className={viewMode === 'yearly' ? styles.active : ''}
                        onClick={() => handleViewToggle('yearly')}
                    >
                        Yearly
                    </button>
                    <button
                        className={viewMode === 'monthly' ? styles.active : ''}
                        onClick={() => handleViewToggle('monthly')}
                    >
                        Monthly
                    </button>
                </div>

                {/* 3. Year Selection */}
                <div className={styles.yearSelector}>
                    {YEARS.map(y => (
                        <button key={y} onClick={() => handleSetSelectedYear(y)} className={selectedYear === y ? styles.active : ''}>{y}</button>
                    ))}
                </div>

                {/* 4. Month Selector */}
                <div className={styles.monthSelector}>
                    {MONTHS.map((m, idx) => (
                        <button
                            key={m}
                            onClick={() => handleSetMonth(idx)}
                            className={month === idx ? styles.active : ''}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.dashboardContent}>

                {/* 1. Totals (Yearly or Monthly) */}
                <div className={styles.cardWrapper}>
                    <Totals
                        viewMode={viewMode}
                        year={selectedYear}
                        month={month}
                        events={accessibleEvents}
                        yearlyData={yearlyData}
                        visibleEmployees={visibleEmployees}
                        selectedEmployees={selectedEmployees}
                        isManager={isManagerMode}
                        selectedFilters={selectedFilters}
                        onToggleFilter={toggleFilter}
                        onToggleEmployee={toggleEmployee}
                    />
                </div>

                {/* 2. Calendar Grid (Always Visible) */}
                <div className={styles.cardWrapper}>
                    <Calendar
                        year={selectedYear}
                        month={month}
                        events={accessibleEvents}
                        holidays={holidays}
                        selectedEmployees={selectedEmployees}
                        selectedFilters={selectedFilters}
                        isManager={isManagerMode}
                    />
                </div>

                {/* 3. Events History Card */}
                <div className={styles.cardWrapper}>
                    <Events
                        visibleEvents={filteredHistoryEvents}
                        allEvents={accessibleEvents}
                        selectedYear={selectedYear}
                        month={month}
                        employees={employees}
                        currentUser={currentUser}
                        isManager={isManagerMode}
                        yearlyData={yearlyData}
                        holidays={holidays}
                        onRefresh={fetchData}
                        onDirtyChange={setIsDirty}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
