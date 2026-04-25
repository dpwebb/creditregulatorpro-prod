/**
 * A utility module providing drop-in replacements for date-fns functions
 * using native JS Date and Intl APIs.
 */

// --- Formatting ---

export function format(date: Date | string, formatStr: string): string {
  if (typeof date === 'string') date = new Date(date);
  const yyyy = date.getFullYear().toString();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dStr = date.getDate().toString();
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const hStr = String(date.getHours() % 12 || 12);
  const a = date.getHours() >= 12 ? 'PM' : 'AM';

  const MMM = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  const MMMM = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const doStr = getOrdinal(date.getDate());

  switch (formatStr) {
    case 'yyyyMMdd':
      return `${yyyy}${MM}${dd}`;
    case 'yyyy-MM-dd':
      return `${yyyy}-${MM}-${dd}`;
    case 'yyyy-MM-dd HH:mm':
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
    case 'yyyy-MM-dd HH:mm:ss':
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    case 'yyyy-MM-dd HH:mm:ss zzz': {
      const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date);
      const zzz = parts.find((p) => p.type === 'timeZoneName')?.value || '';
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss} ${zzz}`;
    }
    case 'MMM d, yyyy':
      return `${MMM} ${dStr}, ${yyyy}`;
    case 'MMM d, yyyy HH:mm':
      return `${MMM} ${dStr}, ${yyyy} ${HH}:${mm}`;
    case 'MMM d':
      return `${MMM} ${dStr}`;
    case 'MMM yyyy':
    case 'MMM YYYY':
      return `${MMM} ${yyyy}`;
    case 'MMMM yyyy':
    case 'MMMM YYYY':
      return `${MMMM} ${yyyy}`;
    case 'dd':
      return dd;
    case 'd':
      return dStr;
    case 'eeee':
    case 'EEEE':
    case 'cccc':
      return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date as Date);
    case 'eee':
    case 'EEE':
    case 'E':
    case 'ccc':
      return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date as Date);
    case 'cccccc':
      return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date as Date).slice(0, 2);
    case 'MMMM d, yyyy':
      return `${MMMM} ${dStr}, ${yyyy}`;
    case 'h:mm a':
      return `${hStr}:${mm} ${a}`;
    case 'PPP':
      return `${MMMM} ${doStr}, ${yyyy}`;
    case 'PPP p':
      return `${MMMM} ${doStr}, ${yyyy} at ${hStr}:${mm} ${a}`;
    case 'PP':
      return `${MMM} ${dStr}, ${yyyy}`;
    case 'PPpp':
      return `${MMM} ${dStr}, ${yyyy}, ${hStr}:${mm}:${ss} ${a}`;
    case "MMM d, yyyy 'at' h:mm a":
      return `${MMM} ${dStr}, ${yyyy} at ${hStr}:${mm} ${a}`;
    default:
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date as Date);
  }
}

export function formatDistanceToNow(date: Date | string, options?: { addSuffix?: boolean }): string {
  if (typeof date === 'string') date = new Date(date);
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'always' });
  const now = new Date();
  const diffInMs = date.getTime() - now.getTime();
  const diffInSecs = diffInMs / 1000;

  const absSecs = Math.abs(diffInSecs);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absSecs < 60) {
    value = diffInSecs;
    unit = 'second';
  } else if (absSecs < 3600) {
    value = diffInSecs / 60;
    unit = 'minute';
  } else if (absSecs < 86400) {
    value = diffInSecs / 3600;
    unit = 'hour';
  } else if (absSecs < 2592000) {
    value = diffInSecs / 86400;
    unit = 'day';
  } else if (absSecs < 31536000) {
    value = diffInSecs / 2592000;
    unit = 'month';
  } else {
    value = diffInSecs / 31536000;
    unit = 'year';
  }

  const formatted = rtf.format(Math.round(value), unit);

  if (!options?.addSuffix) {
    if (formatted.startsWith('in ')) return formatted.slice(3);
    if (formatted.endsWith(' ago')) return formatted.slice(0, -4);
  }

  return formatted;
}

// --- Parsing ---

export function parseISO(str: string): Date {
  return new Date(str);
}

export function parse(dateString: string, formatString: string, referenceDate: Date): Date {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const date = referenceDate.getDate();

  let y = year,
    m = month,
    d = date;
  let parsed = false;

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (formatString === 'MM/dd/yyyy') {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      m = parseInt(parts[0], 10) - 1;
      d = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      parsed = true;
    }
  } else if (formatString === 'dd/MM/yyyy') {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
      parsed = true;
    }
  } else if (formatString === 'yyyy-MM-dd') {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
      parsed = true;
    }
  } else if (formatString === 'MMMM d, yyyy' || formatString === 'MMM d, yyyy') {
    const parts = dateString.replace(',', '').split(' ');
    if (parts.length >= 3) {
      m = MONTH_LONG.findIndex((mon) => mon === parts[0]);
      if (m === -1) m = MONTH_SHORT.findIndex((mon) => mon === parts[0]);
      d = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      parsed = true;
    }
  } else if (formatString === 'MMMM yyyy') {
    const parts = dateString.split(' ');
    if (parts.length >= 2) {
      m = MONTH_LONG.findIndex((mon) => mon === parts[0]);
      if (m === -1) m = MONTH_SHORT.findIndex((mon) => mon === parts[0]);
      d = 1;
      y = parseInt(parts[1], 10);
      parsed = true;
    }
  }

  return parsed ? new Date(y, m, d) : new Date(NaN);
}

export function isValid(date: unknown): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

// --- Comparison ---

export function isBefore(date1: Date | string, date2: Date | string): boolean {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  return d1.getTime() < d2.getTime();
}

export function isAfter(date1: Date | string, date2: Date | string): boolean {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  return d1.getTime() > d2.getTime();
}

export function isPast(date: Date | string): boolean {
  const d = date instanceof Date ? date : new Date(date);
  return d.getTime() < Date.now();
}

export function isFuture(date: Date | string): boolean {
  const d = date instanceof Date ? date : new Date(date);
  return d.getTime() > Date.now();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function isSameWeek(date1: Date, date2: Date, options?: { weekStartsOn?: number }): boolean {
  const start1 = startOfWeek(date1, options);
  const start2 = startOfWeek(date2, options);
  return start1.getTime() === start2.getTime();
}

export function isSameMinute(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate() &&
    date1.getHours() === date2.getHours() &&
    date1.getMinutes() === date2.getMinutes()
  );
}

export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

export function isWithinInterval(date: Date, interval: { start: Date; end: Date }): boolean {
  const t = date.getTime();
  return t >= interval.start.getTime() && t <= interval.end.getTime();
}

export function compareAsc(date1: Date, date2: Date): number {
  const t1 = date1.getTime();
  const t2 = date2.getTime();
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}

// --- Arithmetic ---

export function subDays(date: Date, amount: number): Date {
  return addDays(date, -amount);
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function addMonths(date: Date, amount: number): Date {
  const result = new Date(date);
  const expectedMonth = (((result.getMonth() + amount) % 12) + 12) % 12;
  result.setMonth(result.getMonth() + amount);

  // Prevent month overflow, e.g. adding 1 month to Jan 31 becoming Mar 3.
  if (result.getMonth() !== expectedMonth) {
    result.setDate(0);
  }
  return result;
}

export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12);
}

export function subMonths(date: Date, amount: number): Date {
  return addMonths(date, -amount);
}

export function subYears(date: Date, amount: number): Date {
  return addYears(date, -amount);
}

// --- Calculation ---

export function differenceInDays(dateLeft: Date, dateRight: Date): number {
  const diff = dateLeft.getTime() - dateRight.getTime();
  return Math.trunc(diff / (1000 * 60 * 60 * 24));
}

export function differenceInMonths(dateLeft: Date, dateRight: Date): number {
  const yearDiff = dateLeft.getFullYear() - dateRight.getFullYear();
  const monthDiff = dateLeft.getMonth() - dateRight.getMonth();
  const dayDiff = dateLeft.getDate() - dateRight.getDate();
  let result = yearDiff * 12 + monthDiff;
  // Adjust if the day of dateLeft hasn't reached the day of dateRight yet
  if (dayDiff < 0) result -= 1;
  return result;
}

export function differenceInCalendarDays(dateLeft: Date, dateRight: Date): number {
  const startLeft = startOfDay(dateLeft);
  const startRight = startOfDay(dateRight);
  const diff = startLeft.getTime() - startRight.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

// --- Date Parts ---

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfWeek(date: Date, options?: { weekStartsOn?: number }): Date {
  const result = new Date(date);
  const weekStartsOn = options?.weekStartsOn ?? 0;
  const day = result.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function getDay(date: Date): number {
  return date.getDay();
}

export function set(
  date: Date,
  values: {
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
    year?: number;
    month?: number;
    date?: number;
  }
): Date {
  const result = new Date(date);
  if (values.year !== undefined) result.setFullYear(values.year);
  if (values.month !== undefined) result.setMonth(values.month);
  if (values.date !== undefined) result.setDate(values.date);
  if (values.hours !== undefined) result.setHours(values.hours);
  if (values.minutes !== undefined) result.setMinutes(values.minutes);
  if (values.seconds !== undefined) result.setSeconds(values.seconds);
  if (values.milliseconds !== undefined) result.setMilliseconds(values.milliseconds);
  return result;
}