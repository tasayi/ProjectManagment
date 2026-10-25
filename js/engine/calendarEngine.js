/**
 * Calendar Engine: Evaluates working days, holidays, and overtime days for task scheduling
 */

import { ProjectCalendar } from '../models/calendarModel.js';

export class CalendarEngine {

    /**
     * Check if a specific date string (YYYY-MM-DD) is a valid working day
     */
    static isWorkingDay(dateStr, calendar = new ProjectCalendar()) {
        if (!dateStr) return false;
        
        // 1. Check if explicitly marked as Overtime Working Day
        if (calendar.overtimeDays && calendar.overtimeDays.some(o => o.date === dateStr)) {
            return true;
        }

        // 2. Check if explicitly marked as Festive / Company Holiday
        if (calendar.holidays && calendar.holidays.some(h => h.date === dateStr)) {
            return false;
        }

        // 3. Check standard weekly working days (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay();
        const workingDays = calendar.workingDays || [1, 2, 3, 4, 5];

        return workingDays.includes(dayOfWeek);
    }

    /**
     * Get Holiday Info for a date if it exists
     */
    static getHoliday(dateStr, calendar = new ProjectCalendar()) {
        if (!calendar || !calendar.holidays) return null;
        return calendar.holidays.find(h => h.date === dateStr) || null;
    }

    /**
     * Get Overtime Working Day Info if it exists
     */
    static getOvertime(dateStr, calendar = new ProjectCalendar()) {
        if (!calendar || !calendar.overtimeDays) return null;
        return calendar.overtimeDays.find(o => o.date === dateStr) || null;
    }

    /**
     * Add N working days to a start date string (YYYY-MM-DD) respecting calendar
     */
    static addWorkingDays(startDateStr, days, calendar = new ProjectCalendar()) {
        if (!startDateStr) return '';
        if (days <= 0) return startDateStr;

        // Task occupies working days only: snap a non-working start forward first
        return this.shiftWorkingDays(this.nextWorkingDay(startDateStr, calendar), days - 1, calendar);
    }

    /** ISO (YYYY-MM-DD) to DD/MM/YYYY */
    static formatDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
    }

    /** DD/MM/YYYY (or ISO) to ISO; returns null when invalid */
    static parseDate(str) {
        const s = (str || '').trim();
        let y, mo, d;
        let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
        if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
        else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else return null;
        const dt = new Date(Date.UTC(y, mo - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
        return dt.toISOString().split('T')[0];
    }

    static addCalendarDays(dateStr, n) {
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().split('T')[0];
    }

    /**
     * First working day on or after dateStr
     */
    static nextWorkingDay(dateStr, calendar = new ProjectCalendar()) {
        if (!dateStr) return dateStr;
        let cur = dateStr;
        for (let i = 0; i < 3660; i++) {
            if (this.isWorkingDay(cur, calendar)) return cur;
            cur = this.addCalendarDays(cur, 1);
        }
        return dateStr;
    }

    /**
     * Move n working days forward (n > 0) or backward (n < 0) from the nearest working day on/after dateStr
     */
    static shiftWorkingDays(dateStr, n, calendar = new ProjectCalendar()) {
        if (!dateStr) return dateStr;
        let cur = this.nextWorkingDay(dateStr, calendar);
        const step = n < 0 ? -1 : 1;
        let remaining = Math.abs(n);
        let guard = 0;
        while (remaining > 0 && guard++ < 36600) {
            cur = this.addCalendarDays(cur, step);
            if (this.isWorkingDay(cur, calendar)) remaining--;
        }
        return cur;
    }

    /**
     * Calculate count of working days between start and finish dates (inclusive)
     */
    static getWorkingDays(startDateStr, endDateStr, calendar = new ProjectCalendar()) {
        if (!startDateStr || !endDateStr) return 1;
        if (startDateStr > endDateStr) return 1;

        let count = 0;
        let current = startDateStr;

        while (current <= endDateStr) {
            if (this.isWorkingDay(current, calendar)) {
                count++;
            }
            current = this.addCalendarDays(current, 1);
        }

        return Math.max(1, count);
    }
}

