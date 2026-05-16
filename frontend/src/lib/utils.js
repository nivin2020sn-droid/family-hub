import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Determine readable text color based on background hex
export function getContrastTextColor(hex) {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#2D2A26" : "#FFFFFF";
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Base day names — index 0 = Sunday
const DAY_NAMES_BASE = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Default exported names start on Monday (most family-friendly)
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Return day-name labels rotated so the array starts on `weekStart`
// (0 = Sun, 1 = Mon, 6 = Sat)
export function getDayNames(weekStart = 1) {
  const start = (weekStart + 7) % 7;
  return [...Array(7)].map((_, i) => DAY_NAMES_BASE[(start + i) % 7]);
}

// Build a 6-row matrix of dates for the calendar grid.
// `weekStart` controls which weekday the rows begin on.
export function buildMonthMatrix(year, month, weekStart = 1) {
  const start = (weekStart + 7) % 7;
  const first = new Date(year, month - 1, 1);
  const firstDayOfWeek = first.getDay(); // 0 = Sun
  // Days to subtract from the 1st so the first cell is on weekStart
  const offset = (firstDayOfWeek - start + 7) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const matrix = [];
  let dayCounter = 1 - offset;
  for (let r = 0; r < 6; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      const date = new Date(year, month - 1, dayCounter);
      row.push({
        date,
        iso: date.toISOString().slice(0, 10),
        inMonth: dayCounter >= 1 && dayCounter <= daysInMonth,
        day: date.getDate(),
      });
      dayCounter += 1;
    }
    matrix.push(row);
  }
  return matrix;
}

export function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
