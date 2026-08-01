
export type Period = 'today' | 'this_week' | 'this_month';

export interface DateRange {
  from: Date;
  to:   Date;
}

export function getDateRange(period: Period): DateRange {
  // "to" is always right now
  const to   = new Date();

  // "from" depends on the period
  const from = new Date();

  if (period === 'today') {
    // Midnight of today in local time
    from.setHours(0, 0, 0, 0);

  } else if (period === 'this_week') {
    // Go back to Monday
    // getDay() returns 0=Sunday, 1=Monday ... 6=Saturday
    const day = from.getDay();

    // How many days to subtract to get to Monday
    // Sunday (0) → subtract 6, Monday (1) → subtract 0, Tuesday (2) → subtract 1...
    const daysToMonday = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - daysToMonday);
    from.setHours(0, 0, 0, 0);

  } else if (period === 'this_month') {
    // First day of current month
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }

  return { from, to };
}