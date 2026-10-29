/**
 * Date and time formatting utility for appointment notifications.
 * All user-facing notification strings are formatted in Indian Standard Time (Asia/Kolkata, UTC+05:30).
 */

export interface FormattedAppointmentDateTime {
  dateStr: string;
  timeStr: string;
}

export function formatAppointmentDateTime(isoDateString: string | Date): FormattedAppointmentDateTime {
  const d = new Date(isoDateString);
  if (isNaN(d.getTime())) {
    return { dateStr: '', timeStr: '' };
  }

  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { dateStr, timeStr };
}
