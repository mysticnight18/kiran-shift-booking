export const cities = ['Helsinki', 'Tampere', 'Turku'];

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function overlaps(a, b) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export function getBookingBlock(shift, booked, now) {
  if (shift.booked) return null;
  if (shift.startTime <= now) return 'Started';
  if (booked.some(item => overlaps(shift, item))) return 'Overlaps';
  return null;
}

export function shiftTimeRange(shift) {
  return `${timeFormat.format(shift.startTime)} – ${timeFormat.format(shift.endTime)}`;
}

export function groupByDate(shifts) {
  const groups = new Map();
  const ordered = [...shifts].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  for (const shift of ordered) {
    const date = dayFormat.format(shift.startTime);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(shift);
  }
  return [...groups].map(([title, data]) => ({ title, data }));
}

export function dayStart(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function addDays(timestamp, count) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + count);
  return date.getTime();
}

export function weekStart(timestamp) {
  const day = dayStart(timestamp);
  return addDays(day, -((new Date(day).getDay() + 6) % 7));
}
