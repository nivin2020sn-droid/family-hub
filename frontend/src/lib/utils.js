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

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Build a 6-row matrix of dates for the calendar grid
export function buildMonthMatrix(year, month) {
  // month: 1-12
  const first = new Date(year, month - 1, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const matrix = [];
  let dayCounter = 1 - startDay;
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
