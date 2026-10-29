
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const parts = dateKey.split('-').map(Number);
  const y = parts[0] || 2026;
  const m = (parts[1] || 9) - 1;
  const d = parts[2] || 1;
  return new Date(y, m, d);
}
import crypto from 'crypto';

import { pool } from '@/db/pool.js';

import type {
  Appointment,
  AppointmentRescheduleRequest,
  AppointmentSlot,
  DateSlotSummary,
  DoctorAvailabilityItem,
  DoctorAvailabilityResult,
  DoctorProfile,
  DoctorRescheduleRequestItem,
} from './appointments.types.js';

interface DBDoctorProfileRow {
  userId: string;
  fullName: string;
  qualifications: string | null;
  specialty: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  profileImageUrl: string | null;
}

interface DBAppointmentRow {
  id: string;
  patientId: string;
  doctorId: string;
  slotId: string | null;
  scheduledStart: string | Date;
  scheduledEnd: string | Date;
  tokenNumber: string;
  purpose: string;
  patientNote: string | null;
  patientName: string | null;
  patientPhone: string | null;
  status: Appointment['status'];
  rescheduleReason?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  docFullName?: string | null;
  docQualifications?: string | null;
  docSpecialty?: string | null;
  docClinicName?: string | null;
  docClinicAddress?: string | null;
  docContactPhone?: string | null;
}

const DAY_MAP = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getDoctorById(doctorId: string): Promise<DoctorProfile | null> {
  const { rows } = await pool.query<DBDoctorProfileRow>(`
    SELECT 
      id AS "userId",
      name AS "fullName",
      qualification AS qualifications,
      specialization AS specialty,
      clinic_address AS "clinicName",
      clinic_address AS "clinicAddress",
      phone AS "contactPhone",
      email AS "contactEmail",
      profile_image_url AS "profileImageUrl"
    FROM doctors
    WHERE id = $1 OR user_account_id = $1
    LIMIT 1
  `, [doctorId]);

  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    userId: r.userId,
    fullName: r.fullName,
    qualifications: r.qualifications ?? undefined,
    specialty: r.specialty ?? undefined,
    clinicName: r.clinicName ?? undefined,
    clinicAddress: r.clinicAddress ?? undefined,
    contactPhone: r.contactPhone ?? undefined,
    contactEmail: r.contactEmail ?? undefined,
    profileImageUrl: r.profileImageUrl ?? undefined,
  };
}

export async function getDefaultDoctor(): Promise<DoctorProfile | null> {
  const { rows } = await pool.query<DBDoctorProfileRow>(`
    SELECT 
      id AS "userId",
      name AS "fullName",
      NULL::text AS qualifications,
      specialization AS specialty,
      NULL::text AS "clinicName",
      NULL::text AS "clinicAddress",
      phone AS "contactPhone",
      email AS "contactEmail",
      NULL::text AS "profileImageUrl"
    FROM doctors
    ORDER BY created_at ASC
    LIMIT 1
  `);

  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    userId: r.userId,
    fullName: r.fullName,
    qualifications: r.qualifications ?? undefined,
    specialty: r.specialty ?? undefined,
    clinicName: r.clinicName ?? undefined,
    clinicAddress: r.clinicAddress ?? undefined,
    contactPhone: r.contactPhone ?? undefined,
    contactEmail: r.contactEmail ?? undefined,
    profileImageUrl: r.profileImageUrl ?? undefined,
  };
}

function generateSlotId(doctorId: string, dateStr: string, startTimeStr: string): string {
  const hash = crypto
    .createHash('md5')
    .update(`${doctorId}:${dateStr}:${startTimeStr}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface LocationInfo {
  id: string;
  name: string;
  address?: string | null | undefined;
  map_link?: string | null | undefined;
  is_primary?: boolean | undefined;
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = String(timeStr).slice(0, 8).split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export async function getLocationsByIds(locationIds: string[]): Promise<Map<string, LocationInfo>> {
  const map = new Map<string, LocationInfo>();
  const validIds = Array.from(new Set(locationIds.filter(id => id && String(id).trim().length > 0)));
  if (validIds.length === 0) return map;

  const { rows } = await pool.query<{
    id: string;
    location_name: string;
    address: string | null;
    map_link: string | null;
    is_primary: boolean | null;
  }>(
    `SELECT id, location_name, address, map_link, is_primary 
     FROM doctor_locations 
     WHERE id = ANY($1::uuid[])`,
    [validIds],
  );

  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.location_name,
      address: r.address,
      map_link: r.map_link,
      is_primary: Boolean(r.is_primary),
    });
  }
  return map;
}

export async function getDoctorAvailability(
  doctorId: string,
  date: string,
  locationId?: string | null,
): Promise<DoctorAvailabilityResult> {
  const formattedDate = date;

  // 1. Query custom date-specific availability (no initial location restriction)
  const customQuery = `
    SELECT ca.id, ca.doctor_id, ca.date, ca.location_id, ca.start_time, ca.end_time, ca.status,
           dl.location_name, dl.address as location_address
    FROM doctor_custom_availability ca
    LEFT JOIN doctor_locations dl ON ca.location_id = dl.id
    WHERE ca.doctor_id = $1 AND ca.date = $2::date
    ORDER BY ca.start_time ASC
  `;
  const customRes = await pool.query<{
    id: string;
    doctor_id: string;
    date: Date | string;
    location_id: string;
    start_time: string;
    end_time: string;
    status: string;
    location_name?: string | null;
    location_address?: string | null;
    is_available?: boolean;
  }>(customQuery, [doctorId, formattedDate]);

  // 2. Query regular availability (no initial location restriction)
  const [year = 0, month = 1, day = 1] = formattedDate.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayNameUpper = DAY_MAP[dateObj.getDay()]!;

  const regularQuery = `
    SELECT da.day_of_week, da.start_time, da.end_time, da.status, da.slot_length, da.location_id,
           dl.location_name, dl.address as location_address
    FROM doctor_availability da
    LEFT JOIN doctor_locations dl ON da.location_id = dl.id
    WHERE da.doctor_id = $1 AND da.day_of_week = $2 AND UPPER(da.status) = 'ACTIVE'
    ORDER BY da.start_time ASC
  `;
  const regularRes = await pool.query<{
    day_of_week: string;
    start_time: string;
    end_time: string;
    status: string;
    slot_length: number;
    location_id?: string;
    location_name?: string | null;
    location_address?: string | null;
  }>(regularQuery, [doctorId, dayNameUpper]);

  const customRows = customRes.rows;
  const regularRows = regularRes.rows;

  if (customRows.length > 0) {
    console.log('Custom availability found', {
      doctorId,
      date: formattedDate,
      locationId: locationId || undefined,
    });
  } else if (regularRows.length > 0) {
    console.log('Using regular availability', {
      doctorId,
      date: formattedDate,
      locationId: locationId || undefined,
    });
  }

  const items: DoctorAvailabilityItem[] = [];

  // Active custom records
  const activeCustom = customRows.filter(r => {
    const isInactive =
      r.is_available === false ||
      String(r.status).toUpperCase() === 'INACTIVE' ||
      String(r.status).toUpperCase() === 'UNAVAILABLE';
    return !isInactive;
  });

  for (const cr of activeCustom) {
    items.push({
      start_time: String(cr.start_time).slice(0, 8),
      end_time: String(cr.end_time).slice(0, 8),
      slot_length: 30,
      status: cr.status,
      is_available: true,
      location_id: cr.location_id,
      locationId: cr.location_id,
      location_name: cr.location_name ?? undefined,
      location_address: cr.location_address ?? undefined,
      source: 'custom',
    });
  }

  // Regular records (excluding portions overlapping with any custom records)
  for (const rr of regularRows) {
    const regStartMins = parseTimeToMinutes(rr.start_time);
    const regEndMins = parseTimeToMinutes(rr.end_time);
    const slotLen = rr.slot_length || 30;

    let curr = regStartMins;
    let segStart = -1;

    while (curr + slotLen <= regEndMins) {
      const segEnd = curr + slotLen;
      const overlapsCustom = customRows.some(cr => {
        const cStart = parseTimeToMinutes(cr.start_time);
        const cEnd = parseTimeToMinutes(cr.end_time);
        return curr < cEnd && segEnd > cStart;
      });

      if (!overlapsCustom) {
        if (segStart === -1) segStart = curr;
      } else {
        if (segStart !== -1) {
          items.push({
            start_time: formatMinutesToTime(segStart),
            end_time: formatMinutesToTime(curr),
            slot_length: slotLen,
            status: rr.status,
            is_available: true,
            location_id: rr.location_id,
            locationId: rr.location_id,
            location_name: rr.location_name ?? undefined,
            location_address: rr.location_address ?? undefined,
            source: 'regular',
          });
          segStart = -1;
        }
      }
      curr += slotLen;
    }

    if (segStart !== -1) {
      items.push({
        start_time: formatMinutesToTime(segStart),
        end_time: formatMinutesToTime(curr),
        slot_length: slotLen,
        status: rr.status,
        is_available: true,
        location_id: rr.location_id,
        locationId: rr.location_id,
        location_name: rr.location_name ?? undefined,
        location_address: rr.location_address ?? undefined,
        source: 'regular',
      });
    }
  }

  // Sort items chronologically
  items.sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Batch fetch location details
  const locIds = Array.from(new Set(items.map(i => i.location_id).filter(Boolean))) as string[];
  const locMap = await getLocationsByIds(locIds);

  for (const item of items) {
    if (item.location_id && locMap.has(item.location_id)) {
      const loc = locMap.get(item.location_id)!;
      item.location = loc;
      item.location_name = loc.name;
      item.location_address = loc.address ?? undefined;
    }
  }

  // Final location filter:
  // If locationId === 'all', return all items unfiltered.
  // If locationId is provided, filter for that location.
  // If locationId is null / falsy, return only items with no location (location_id IS NULL).
  const filteredItems = locationId === 'all'
    ? items
    : locationId
      ? items.filter(i => i.location_id === locationId || i.locationId === locationId)
      : items.filter(i => !i.location_id && !i.locationId);

  const hasCustom = filteredItems.some(i => i.source === 'custom');
  const hasRegular = filteredItems.some(i => i.source === 'regular');
  const source: 'custom' | 'regular' | 'combined' =
    hasCustom && hasRegular ? 'combined' : hasCustom ? 'custom' : 'regular';

  return {
    source,
    availability: filteredItems,
  };
}

export async function getSlotsForDoctor(
  doctorId: string,
  startDateStr: string,
  daysCount: number,
  locationId?: string | null,
): Promise<DateSlotSummary[]> {
  const [year = 0, month = 1, day = 1] = startDateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + daysCount);

  const blockedRes = await pool.query<{
    blocked_date: string | Date;
    start_time: string;
    end_time: string;
    reason: string | null;
  }>(
    `SELECT blocked_date, start_time, end_time, reason 
     FROM doctor_blocked_dates 
     WHERE doctor_id = $1`,
    [doctorId],
  );

  const bookedRes = await pool.query<{
    scheduled_start: Date | string;
    scheduled_end: Date | string;
  }>(
    `SELECT scheduled_start, scheduled_end 
     FROM appointments 
     WHERE doctor_id = $1 
       AND status IN ('scheduled', 'confirmed', 'rescheduled')
       AND scheduled_start >= $2 AND scheduled_start <= $3`,
    [doctorId, start.toISOString(), end.toISOString()],
  );

  let reservedRes = { rows: [] as { proposed_start: Date | string; proposed_end: Date | string }[] };
  try {
    reservedRes = await pool.query<{
      proposed_start: Date | string;
      proposed_end: Date | string;
    }>(
      `SELECT proposed_start, proposed_end
       FROM appointment_reschedule_requests
       WHERE doctor_id = $1
         AND status = 'pending'
         AND expires_at > NOW()
         AND proposed_start >= $2 AND proposed_start <= $3`,
      [doctorId, start.toISOString(), end.toISOString()],
    );
  } catch (_e) {
    // Graceful fallback if table does not exist in mock env
  }

  const bookedTimes = [
    ...bookedRes.rows.map(r => new Date(r.scheduled_start).getTime()),
    ...reservedRes.rows.map(r => new Date(r.proposed_start).getTime()),
  ];

  // 1. Batch query all custom date-specific availability records across the date range
  const allCustomRes = await pool.query<{
    id: string;
    doctor_id: string;
    date: Date | string;
    location_id: string;
    start_time: string;
    end_time: string;
    status: string;
    location_name?: string | null;
    location_address?: string | null;
    is_available?: boolean;
  }>(
    `SELECT ca.id, ca.doctor_id, ca.date, ca.location_id, ca.start_time, ca.end_time, ca.status,
            dl.location_name, dl.address as location_address
     FROM doctor_custom_availability ca
     LEFT JOIN doctor_locations dl ON ca.location_id = dl.id
     WHERE ca.doctor_id = $1 AND ca.date >= $2::date AND ca.date <= $3::date
     ORDER BY ca.start_time ASC`,
    [doctorId, startDateStr, formatDateKey(end)],
  );

  // 2. Batch query all active regular availability records for the doctor across all days
  const allRegularRes = await pool.query<{
    day_of_week: string;
    start_time: string;
    end_time: string;
    status: string;
    slot_length: number;
    location_id?: string;
    location_name?: string | null;
    location_address?: string | null;
  }>(
    `SELECT da.day_of_week, da.start_time, da.end_time, da.status, da.slot_length, da.location_id,
            dl.location_name, dl.address as location_address
     FROM doctor_availability da
     LEFT JOIN doctor_locations dl ON da.location_id = dl.id
     WHERE da.doctor_id = $1 AND UPPER(da.status) = 'ACTIVE'
     ORDER BY da.start_time ASC`,
    [doctorId],
  );

  // 3. Batch query all doctor locations once
  const { rows: locRows } = await pool.query<{
    id: string;
    location_name: string;
    address: string | null;
    map_link: string | null;
    is_primary: boolean | null;
  }>(
    `SELECT id, location_name, address, map_link, is_primary 
     FROM doctor_locations 
     WHERE doctor_id = $1`,
    [doctorId],
  );
  const doctorLocationsMap = new Map<string, LocationInfo>();
  for (const r of locRows) {
    doctorLocationsMap.set(r.id, {
      id: r.id,
      name: r.location_name,
      address: r.address,
      map_link: r.map_link,
      is_primary: Boolean(r.is_primary),
    });
  }

  const summaries: DateSlotSummary[] = [];

  for (let d = 0; d < daysCount; d++) {
    const curr = new Date(start);
    curr.setDate(start.getDate() + d);
    const dateStr = formatDateKey(curr);
    const dayNameShort = DAY_NAMES_SHORT[curr.getDay()]!;
    const dayNameUpper = DAY_MAP[curr.getDay()]!;

    const dayBlocks = blockedRes.rows.filter(b => {
      const bDate = typeof b.blocked_date === 'string' ? b.blocked_date.split('T')[0] : formatDateKey(new Date(b.blocked_date));
      return bDate === dateStr;
    });

    const isFullDayBlocked = dayBlocks.some(b => {
      const startT = (b.start_time || '00:00:00').slice(0, 5);
      const endT = (b.end_time || '23:59:00').slice(0, 5);
      return startT <= '09:00' && endT >= '17:00';
    });

    const blockedReason = dayBlocks.find(b => b.reason && b.reason.trim().length > 0)?.reason ||
      (dayBlocks.length > 0 ? 'Doctor on leave' : null);

    // In-memory filter for the current day from pre-fetched rows
    const customRows = allCustomRes.rows.filter(r => {
      const rDate = typeof r.date === 'string' ? r.date.split('T')[0] : formatDateKey(new Date(r.date));
      return rDate === dateStr;
    });
    const regularRows = allRegularRes.rows.filter(r => r.day_of_week === dayNameUpper);

    let slots: AppointmentSlot[] = [];

    if (!isFullDayBlocked) {
      // Generate slots from active custom records
      const activeCustom = customRows.filter(r => {
        const isInactive =
          r.is_available === false ||
          String(r.status).toUpperCase() === 'INACTIVE' ||
          String(r.status).toUpperCase() === 'UNAVAILABLE';
        return !isInactive;
      });

      for (const rule of activeCustom) {
        const slotLen = 30;
        const startMins = parseTimeToMinutes(rule.start_time);
        const endMins = parseTimeToMinutes(rule.end_time);

        let currMins = startMins;
        while (currMins + slotLen <= endMins) {
          const startTimeStr = formatMinutesToTime(currMins);
          const endTimeStr = formatMinutesToTime(currMins + slotLen);
          const slotTimeISO = `${dateStr}T${startTimeStr}`;
          const slotTimeMs = new Date(`${dateStr}T${startTimeStr}`).getTime();

          const isTimeBlocked = dayBlocks.some(b => {
            const bStart = (b.start_time || '00:00:00').slice(0, 8);
            const bEnd = (b.end_time || '23:59:00').slice(0, 8);
            return startTimeStr < bEnd && endTimeStr > bStart;
          });

          const isBooked = isTimeBlocked || bookedTimes.some(bt => Math.abs(bt - slotTimeMs) < 60000);
          const h = Math.floor(currMins / 60);
          const session = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
          const slotId = generateSlotId(doctorId, dateStr, startTimeStr);

          if (!slots.some(s => s.slotTime === slotTimeISO)) {
            slots.push({
              id: slotId,
              doctorId,
              slotTime: slotTimeISO,
              session,
              maxCapacity: 1,
              isBooked,
              start_time: startTimeStr,
              end_time: endTimeStr,
              location_id: rule.location_id,
              locationId: rule.location_id,
              location_name: rule.location_name ?? undefined,
              location_address: rule.location_address ?? undefined,
              source: 'custom',
            });
          }

          currMins += slotLen;
        }
      }

      // Generate slots from regular availability (skipping any slots overlapping with custom records)
      for (const rule of regularRows) {
        const slotLen = rule.slot_length || 30;
        const startMins = parseTimeToMinutes(rule.start_time);
        const endMins = parseTimeToMinutes(rule.end_time);

        let currMins = startMins;
        while (currMins + slotLen <= endMins) {
          const endCurrMins = currMins + slotLen;
          const startTimeStr = formatMinutesToTime(currMins);
          const endTimeStr = formatMinutesToTime(endCurrMins);

          // Overlap check with ANY custom record
          const overlapsCustom = customRows.some(cr => {
            const cStart = parseTimeToMinutes(cr.start_time);
            const cEnd = parseTimeToMinutes(cr.end_time);
            return currMins < cEnd && endCurrMins > cStart;
          });

          if (!overlapsCustom) {
            const slotTimeISO = `${dateStr}T${startTimeStr}`;
            const slotTimeMs = new Date(`${dateStr}T${startTimeStr}`).getTime();

            const isTimeBlocked = dayBlocks.some(b => {
              const bStart = (b.start_time || '00:00:00').slice(0, 8);
              const bEnd = (b.end_time || '23:59:00').slice(0, 8);
              return startTimeStr < bEnd && endTimeStr > bStart;
            });

            const isBooked = isTimeBlocked || bookedTimes.some(bt => Math.abs(bt - slotTimeMs) < 60000);
            const h = Math.floor(currMins / 60);
            const session = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
            const slotId = generateSlotId(doctorId, dateStr, startTimeStr);

            if (!slots.some(s => s.slotTime === slotTimeISO)) {
              slots.push({
                id: slotId,
                doctorId,
                slotTime: slotTimeISO,
                session,
                maxCapacity: 1,
                isBooked,
                start_time: startTimeStr,
                end_time: endTimeStr,
                location_id: rule.location_id,
                locationId: rule.location_id,
                location_name: rule.location_name ?? undefined,
                location_address: rule.location_address ?? undefined,
                source: 'regular',
              });
            }
          }

          currMins += slotLen;
        }
      }
    }

    // Sort slots chronologically
    slots.sort((a, b) => a.slotTime.localeCompare(b.slotTime));

    // Assign location details from pre-fetched in-memory map
    for (const slot of slots) {
      if (slot.location_id && doctorLocationsMap.has(slot.location_id)) {
        const loc = doctorLocationsMap.get(slot.location_id)!;
        slot.location = loc;
        slot.location_name = loc.name;
        slot.location_address = loc.address ?? undefined;
      }
    }

    // Apply final location filter:
    // If locationId === 'all': return all slots without filtering by location.
    // If a specific locationId is provided: return only slots for that location.
    // If no location is selected (null / omitted / falsy): return ONLY regular slots where location_id is null/undefined.
    if (locationId === 'all') {
      // Keep all slots unfiltered
    } else if (locationId) {
      slots = slots.filter(s => s.location_id === locationId || s.locationId === locationId);
    } else {
      slots = slots.filter(s => !s.location_id && !s.locationId);
    }

    const availableCount = slots.filter(s => !s.isBooked).length;
    const isDoctorAvailable = availableCount > 0 && !isFullDayBlocked;

    const firstSlot = slots[0];
    const dayLocationId = firstSlot?.location_id || firstSlot?.locationId;
    const dayLocationName = firstSlot?.location?.name || firstSlot?.location_name;
    const dayLocationAddress = firstSlot?.location?.address || firstSlot?.location_address;
    const dayLocation = firstSlot?.location;

    const hasCustomSlots = slots.some(s => s.source === 'custom');
    const hasRegSlots = slots.some(s => s.source === 'regular');
    const daySource: 'custom' | 'regular' | 'combined' =
      hasCustomSlots && hasRegSlots ? 'combined' : hasCustomSlots ? 'custom' : 'regular';

    summaries.push({
      date: dateStr,
      dayName: dayNameShort,
      dayNumber: curr.getDate(),
      availableCount,
      isDoctorAvailable,
      blockedReason: blockedReason || undefined,
      locationId: dayLocationId,
      locationName: dayLocationName,
      locationAddress: dayLocationAddress,
      location: dayLocation,
      source: daySource,
      slots,
    });
  }

  return summaries;
}

export async function getSlotById(
  slotId: string,
  preferredDoctorId?: string,
): Promise<AppointmentSlot | null> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startStr = formatDateKey(yesterday);

  const candidateDoctorIds = new Set<string>();
  if (preferredDoctorId) {
    candidateDoctorIds.add(preferredDoctorId);
  }

  const defaultDoc = await getDefaultDoctor();
  if (defaultDoc?.userId) {
    candidateDoctorIds.add(defaultDoc.userId);
  }

  const { rows } = await pool.query<{ id: string; user_account_id: string | null }>(
    'SELECT id, user_account_id FROM doctors',
  );
  for (const doc of rows) {
    if (doc.id) candidateDoctorIds.add(doc.id);
    if (doc.user_account_id) candidateDoctorIds.add(doc.user_account_id);
  }

  for (const docId of candidateDoctorIds) {
    const summaries = await getSlotsForDoctor(docId, startStr, 90, 'all');
    for (const day of summaries) {
      const matched = day.slots.find(s => s.id === slotId);
      if (matched) return matched;
    }
  }
  return null;
}

export async function getNextTokenNumber(

  doctorId: string,
  dateStr: string,
): Promise<string> {
  const { rows } = await pool.query<{ count: string }>(
    `
    SELECT count(*) AS count
    FROM appointments
    WHERE doctor_id = $1
      AND scheduled_start::date = $2::date
  `,
    [doctorId, dateStr],
  );
  const count = parseInt(rows[0]!.count, 10) + 1;
  return `#${count.toString().padStart(2, '0')}`;
}

export async function createAppointmentTx(params: {
  patientId: string;
  doctorId: string;
  slotId: string;
  scheduledStart: string;
  scheduledEnd: string;
  tokenNumber: string;
  purpose: string;
  patientNote?: string | undefined;
  patientName?: string | undefined;
  patientPhone?: string | undefined;
}): Promise<Appointment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let patientName = params.patientName;
    let patientPhone = params.patientPhone;

    if (!patientName) {
      const userRes = await client.query<{
        patientName: string;
        patientPhone: string | null;
      }>(
        `
        SELECT 
          COALESCE(p.name, u.username, 'Patient') AS "patientName",
          p.phone AS "patientPhone"
        FROM user_accounts u
        LEFT JOIN patients p ON p.user_account_id = u.id
        WHERE u.id = $1
      `,
        [params.patientId],
      );
      if (userRes.rows.length > 0) {
        patientName = userRes.rows[0]!.patientName ?? 'Patient';
        patientPhone = patientPhone ?? userRes.rows[0]!.patientPhone ?? undefined;
      } else {
        patientName = 'Patient';
      }
    }

    const conflictRes = await client.query(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
         AND status IN ('scheduled', 'confirmed', 'rescheduled')
         AND scheduled_start = $2 
       FOR UPDATE`,
      [params.doctorId, params.scheduledStart],
    );

    if (conflictRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const apptRes = await client.query<DBAppointmentRow>(
      `
      INSERT INTO appointments (
        patient_id, doctor_id, slot_id, scheduled_start, scheduled_end,
        token_number, purpose, patient_note, status, patient_name, patient_phone
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10)
      RETURNING 
        id,
        patient_id AS "patientId",
        doctor_id AS "doctorId",
        slot_id AS "slotId",
        scheduled_start AS "scheduledStart",
        scheduled_end AS "scheduledEnd",
        token_number AS "tokenNumber",
        purpose,
        patient_note AS "patientNote",
        patient_name AS "patientName",
        patient_phone AS "patientPhone",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
      [
        params.patientId,
        params.doctorId,
        params.slotId,
        params.scheduledStart,
        params.scheduledEnd,
        params.tokenNumber,
        params.purpose,
        params.patientNote ?? null,
        patientName,
        patientPhone ?? null,
      ],
    );

    const appt = apptRes.rows[0]!;

    await client.query(
      `
      INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
      VALUES ($1, 'scheduled', $2, 'Appointment created by patient')
    `,
      [appt.id, params.patientId],
    );

    await client.query('COMMIT');
    return {
      id: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      slotId: appt.slotId ?? undefined,
      scheduledStart: new Date(appt.scheduledStart).toISOString(),
      scheduledEnd: new Date(appt.scheduledEnd).toISOString(),
      tokenNumber: appt.tokenNumber,
      purpose: appt.purpose,
      patientNote: appt.patientNote ?? undefined,
      patientName: appt.patientName ?? undefined,
      patientPhone: appt.patientPhone ?? undefined,
      status: appt.status,
      createdAt: new Date(appt.createdAt).toISOString(),
      updatedAt: new Date(appt.updatedAt).toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAppointmentsByPatient(
  patientId: string,
  filter: 'upcoming' | 'history',
): Promise<Appointment[]> {
  const isUpcoming = filter === 'upcoming';
  const query = `
    SELECT 
      a.id,
      a.patient_id AS "patientId",
      a.doctor_id AS "doctorId",
      a.slot_id AS "slotId",
      a.scheduled_start AS "scheduledStart",
      a.scheduled_end AS "scheduledEnd",
      a.token_number AS "tokenNumber",
      a.purpose,
      a.patient_note AS "patientNote",
      a.patient_name AS "patientName",
      a.patient_phone AS "patientPhone",
      a.status,
      a.reschedule_reason AS "rescheduleReason",
      a.cancellation_reason AS "cancellationReason",
      a.cancelled_by AS "cancelledBy",
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      d.name AS "docFullName",
      NULL::text AS "docQualifications",
      d.specialization AS "docSpecialty",
      NULL::text AS "docClinicName",
      NULL::text AS "docClinicAddress",
      d.phone AS "docContactPhone"
    FROM appointments a
    LEFT JOIN doctors d ON (a.doctor_id = d.user_account_id OR a.doctor_id = d.id)
    WHERE (a.patient_id = $1 OR a.patient_id IS NULL)
      AND ${isUpcoming
      ? `a.status IN ('scheduled', 'confirmed', 'rescheduled') AND a.scheduled_start >= NOW() - INTERVAL '1 hour'`
      : `(a.status IN ('completed', 'cancelled', 'no_show') OR a.scheduled_start < NOW() - INTERVAL '1 hour')`
    }
    ORDER BY ${isUpcoming ? 'a.scheduled_start ASC' : 'a.scheduled_start DESC'}
  `;

  const { rows } = await pool.query<DBAppointmentRow>(query, [patientId]);

  return rows.map(r => ({
    id: r.id,
    patientId: r.patientId,
    doctorId: r.doctorId,
    slotId: r.slotId ?? undefined,
    scheduledStart: new Date(r.scheduledStart).toISOString(),
    scheduledEnd: new Date(r.scheduledEnd).toISOString(),
    tokenNumber: r.tokenNumber,
    purpose: r.purpose,
    patientNote: r.patientNote ?? undefined,
    patientName: r.patientName ?? undefined,
    patientPhone: r.patientPhone ?? undefined,
    status: r.status,
    rescheduleReason: r.rescheduleReason ?? undefined,
    cancellationReason: r.cancellationReason ?? undefined,
    cancelledBy: r.cancelledBy ?? undefined,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
    doctor: r.docFullName
      ? {
        userId: r.doctorId,
        fullName: r.docFullName,
        qualifications: r.docQualifications ?? undefined,
        specialty: r.docSpecialty ?? undefined,
        clinicName: r.docClinicName ?? undefined,
        clinicAddress: r.docClinicAddress ?? undefined,
        contactPhone: r.docContactPhone ?? undefined,
      }
      : undefined,
  }));
}

export async function getAppointmentById(
  id: string,
  patientId: string,
): Promise<Appointment | null> {
  const query = `
    SELECT 
      a.id,
      a.patient_id AS "patientId",
      a.doctor_id AS "doctorId",
      a.slot_id AS "slotId",
      a.scheduled_start AS "scheduledStart",
      a.scheduled_end AS "scheduledEnd",
      a.token_number AS "tokenNumber",
      a.purpose,
      a.patient_note AS "patientNote",
      a.patient_name AS "patientName",
      a.patient_phone AS "patientPhone",
      a.status,
      a.reschedule_reason AS "rescheduleReason",
      a.cancellation_reason AS "cancellationReason",
      a.cancelled_by AS "cancelledBy",
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      d.name AS "docFullName",
      NULL::text AS "docQualifications",
      d.specialization AS "docSpecialty",
      NULL::text AS "docClinicName",
      NULL::text AS "docClinicAddress",
      d.phone AS "docContactPhone"
    FROM appointments a
    LEFT JOIN doctors d ON (a.doctor_id = d.user_account_id OR a.doctor_id = d.id)
    WHERE a.id = $1 AND (
      a.patient_id = $2 
      OR a.doctor_id = $2 
      OR (SELECT user_account_id FROM doctors WHERE id = a.doctor_id) = $2 
      OR (SELECT id FROM doctors WHERE user_account_id = $2) = a.doctor_id 
      OR (SELECT user_account_id FROM patients WHERE id = a.patient_id) = $2 
      OR (SELECT id FROM patients WHERE user_account_id = $2) = a.patient_id 
      OR a.patient_id IS NULL
    )
  `;

  const { rows } = await pool.query<DBAppointmentRow>(query, [id, patientId]);
  if (rows.length === 0) return null;
  const r = rows[0]!;

  return {
    id: r.id,
    patientId: r.patientId,
    doctorId: r.doctorId,
    slotId: r.slotId ?? undefined,
    scheduledStart: new Date(r.scheduledStart).toISOString(),
    scheduledEnd: new Date(r.scheduledEnd).toISOString(),
    tokenNumber: r.tokenNumber,
    purpose: r.purpose,
    patientNote: r.patientNote ?? undefined,
    patientName: r.patientName ?? undefined,
    patientPhone: r.patientPhone ?? undefined,
    status: r.status,
    rescheduleReason: r.rescheduleReason ?? undefined,
    cancellationReason: r.cancellationReason ?? undefined,
    cancelledBy: r.cancelledBy ?? undefined,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
    doctor: r.docFullName
      ? {
        userId: r.doctorId,
        fullName: r.docFullName,
        qualifications: r.docQualifications ?? undefined,
        specialty: r.docSpecialty ?? undefined,
        clinicName: r.docClinicName ?? undefined,
        clinicAddress: r.docClinicAddress ?? undefined,
        contactPhone: r.docContactPhone ?? undefined,
      }
      : undefined,
  };
}

export async function rescheduleAppointmentTx(params: {
  appointmentId: string;
  userId: string;
  newSlotId: string;
  reason?: string | undefined;
}): Promise<Appointment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current appointment
    const apptRes = await client.query<{
      id: string;
      doctor_id: string;
      patient_id: string;
      slot_id: string | null;
      status: string;
    }>(
      `SELECT id, doctor_id, patient_id, slot_id, status 
       FROM appointments 
       WHERE id = $1 AND (
         patient_id = $2 
         OR doctor_id = $2 
         OR (SELECT user_account_id FROM doctors WHERE id = appointments.doctor_id) = $2 
         OR (SELECT id FROM doctors WHERE user_account_id = $2) = appointments.doctor_id 
         OR (SELECT user_account_id FROM patients WHERE id = appointments.patient_id) = $2 
         OR (SELECT id FROM patients WHERE user_account_id = $2) = appointments.patient_id 
         OR patient_id IS NULL
       )`,
      [params.appointmentId, params.userId],
    );

    if (apptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentAppt = apptRes.rows[0]!;

    // 2. Look up new slot using appointment's doctor_id
    const newSlot = await getSlotById(params.newSlotId, currentAppt.doctor_id);
    if (!newSlot) {
      await client.query('ROLLBACK');
      return null;
    }

    const newStart = new Date(`${newSlot.slotTime}+05:30`);
    const newEnd = new Date(newStart.getTime() + 25 * 60 * 1000);

    // 3. Ensure slot is not booked by ANOTHER active appointment
    const conflictingRes = await client.query<{ id: string }>(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
         AND id != $2
         AND status IN ('scheduled', 'confirmed', 'rescheduled')
         AND scheduled_start = $3`,
      [newSlot.doctorId || currentAppt.doctor_id, params.appointmentId, newStart.toISOString()],
    );

    if (conflictingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `
      UPDATE appointments
      SET slot_id = $1,
          scheduled_start = $2,
          scheduled_end = $3,
          reschedule_reason = $4,
          status = 'rescheduled',
          updated_at = NOW()
      WHERE id = $5
    `,
      [
        params.newSlotId,
        newStart.toISOString(),
        newEnd.toISOString(),
        params.reason ?? null,
        params.appointmentId,
      ],
    );

    await client.query(
      `
      INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
      VALUES ($1, 'rescheduled', $2, $3)
    `,
      [
        params.appointmentId,
        params.userId,
        params.reason ?? 'Appointment rescheduled',
      ],
    );

    await client.query('COMMIT');
    return await getAppointmentById(params.appointmentId, currentAppt.patient_id || params.userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


export async function cancelAppointmentTx(params: {
  appointmentId: string;
  userId: string;
  reason?: string | undefined;
}): Promise<Appointment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const apptRes = await client.query<{
      id: string;
      doctor_id: string;
      patient_id: string;
      status: string;
    }>(
      `SELECT id, doctor_id, patient_id, status 
       FROM appointments 
       WHERE id = $1 AND (
         patient_id = $2 
         OR doctor_id = $2 
         OR (SELECT user_account_id FROM doctors WHERE id = appointments.doctor_id) = $2 
         OR (SELECT id FROM doctors WHERE user_account_id = $2) = appointments.doctor_id 
         OR (SELECT user_account_id FROM patients WHERE id = appointments.patient_id) = $2 
         OR (SELECT id FROM patients WHERE user_account_id = $2) = appointments.patient_id 
         OR patient_id IS NULL
       )`,
      [params.appointmentId, params.userId],
    );

    if (apptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentAppt = apptRes.rows[0]!;

    await client.query(
      `
      UPDATE appointments
      SET status = 'cancelled',
          cancelled_by = $1,
          cancellation_reason = $2,
          updated_at = NOW()
      WHERE id = $3
    `,
      [params.userId, params.reason ?? null, params.appointmentId],
    );

    // Atomically cancel any pending doctor-requested reschedule proposal to release the reserved proposed slot
    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE appointment_id = $1 AND status = 'pending'`,
      [params.appointmentId],
    );

    await client.query(
      `
      INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
      VALUES ($1, 'cancelled', $2, $3)
    `,
      [
        params.appointmentId,
        params.userId,
        params.reason ?? 'Appointment cancelled',
      ],
    );

    await client.query('COMMIT');
    return await getAppointmentById(params.appointmentId, currentAppt.patient_id || params.userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface AvailabilityRule {
  day_of_week: number;
  start_time_1: string;
  end_time_1: string;
  start_time_2?: string | null | undefined;
  end_time_2?: string | null | undefined;
  is_active: boolean;
}

export async function getDoctorIdByUserId(userId: string): Promise<string | null> {
  // 1. Try users table first (doctor app mobile users)
  try {
    const userRes = await pool.query('SELECT mobile_number FROM users WHERE id = $1', [userId]);
    const mobile = userRes.rows[0]?.mobile_number;
    if (mobile) {
      const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
      const { rows } = await pool.query(
        `SELECT id FROM doctors 
         WHERE phone = $1 
            OR (length($2) >= 10 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2)
         LIMIT 1`,
        [mobile, cleanPhone],
      );
      if (rows[0]?.id) return rows[0].id;
    }
  } catch (_e) {}

  // 2. Try user_accounts table (admin portal / doctor users)
  try {
    const uaRes = await pool.query('SELECT username FROM user_accounts WHERE id = $1', [userId]);
    const username = uaRes.rows[0]?.username;
    if (username) {
      const cleanPhone = username.replace(/\D/g, '').slice(-10);
      const { rows } = await pool.query(
        `SELECT id FROM doctors 
         WHERE phone = $1 
            OR user_account_id = $2
            OR (length($3) >= 10 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $3)
         LIMIT 1`,
        [username, userId, cleanPhone],
      );
      if (rows[0]?.id) return rows[0].id;
    }
  } catch (_e) {}

  // 3. Fallback: try direct user_account_id match on doctors
  const { rows } = await pool.query(
    'SELECT id FROM doctors WHERE user_account_id = $1 LIMIT 1',
    [userId],
  );
  return rows[0]?.id || null;
}

export async function getAppointmentsForDoctor(
  doctorId: string,
  dateStr: string,
): Promise<{
  id: string;
  time: string;
  name: string;
  initials: string;
  status: string;
  purpose: string;
  patientId: string | null;
  patientPhone: string | null;
  tokenNumber: string;
  scheduledStart: string;
  scheduledEnd: string;
}[]> {
  const { rows } = await pool.query(`
    SELECT
      a.id,
      a.patient_id      AS "patientId",
      a.scheduled_start AS "scheduledStart",
      a.scheduled_end   AS "scheduledEnd",
      a.token_number    AS "tokenNumber",
      a.purpose,
      a.patient_name    AS "patientName",
      a.patient_phone   AS "patientPhone",
      a.status,
      a.consultation_notes AS "consultationNotes",
      p.name            AS "patientNameFromTable"
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = $1
      AND DATE(a.scheduled_start AT TIME ZONE 'Asia/Kolkata') = $2::date
    ORDER BY a.scheduled_start ASC
  `, [doctorId, dateStr]);

  return rows.map(r => {
    const rawName: string = r.patientName || r.patientNameFromTable || 'Patient';
    // Build initials from name
    const parts = rawName.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
      : rawName.slice(0, 2).toUpperCase();

    // Format time as HH:MM (IST)
    const dt = new Date(r.scheduledStart);
    const timeStr = dt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });

    // Map DB status to UI status
    const statusMap: Record<string, string> = {
      scheduled: 'scheduled',
      confirmed: 'scheduled',
      rescheduled: 'scheduled',
      completed: 'completed',
      cancelled: 'cancelled',
      no_show: 'cancelled',
    };

    return {
      id: r.id,
      time: timeStr,
      name: rawName,
      initials,
      status: statusMap[r.status] ?? 'scheduled',
      purpose: r.purpose || '',
      patientId: r.patientId || null,
      patientPhone: r.patientPhone || null,
      tokenNumber: r.tokenNumber || '',
      scheduledStart: new Date(r.scheduledStart).toISOString(),
      scheduledEnd: new Date(r.scheduledEnd).toISOString(),
      consultationNotes: r.consultationNotes || undefined,
    };
  });
}

export async function getAvailabilityRules(doctorId: string, locationId?: string | null) {
  let query = `SELECT day_of_week, start_time, end_time, status, slot_length
               FROM doctor_availability
               WHERE doctor_id = $1`;
  const params: any[] = [doctorId];

  if (locationId) {
    query += ` AND location_id = $2`;
    params.push(locationId);
  } else {
    // If no location provided, get primary location or records with NULL location_id
    query += ` AND (
      location_id = (
        SELECT id FROM doctor_locations 
        WHERE (doctor_id = $1 OR doctor_id = (SELECT user_account_id FROM doctors WHERE id = $1)) 
          AND is_primary = true 
        LIMIT 1
      ) 
      OR location_id IS NULL
    )`;
  }

  const result = await pool.query<{
    day_of_week: string;
    start_time: string;
    end_time: string;
    status: string;
    slot_length: number;
  }>(query, params);

  const rules: (AvailabilityRule & { slot_duration_minutes: number })[] = result.rows.map(row => {
    return {
      day_of_week: DAY_MAP.includes(row.day_of_week) ? DAY_MAP.indexOf(row.day_of_week) : 0,
      start_time_1: row.start_time,
      end_time_1: row.end_time,
      start_time_2: null,
      end_time_2: null,
      slot_duration_minutes: row.slot_length || 30,
      is_active: row.status === 'ACTIVE',
    };
  });

  return rules.sort((a, b) => a.day_of_week - b.day_of_week);
}

export async function upsertAvailabilityRules(
  doctorId: string,
  locationId: string | null | undefined,
  slotDurationMinutes: number,
  rules: AvailabilityRule[],
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetLocationId = locationId;
    if (!targetLocationId) {
      const locRes = await client.query<{ id: string }>(
        `SELECT id FROM doctor_locations 
         WHERE (doctor_id = $1 OR doctor_id = (SELECT user_account_id FROM doctors WHERE id = $1)) 
           AND is_primary = true 
         LIMIT 1`,
        [doctorId],
      );
      if (locRes.rows.length > 0 && locRes.rows[0]?.id) {
        targetLocationId = locRes.rows[0].id;
      }
    }

    if (targetLocationId) {
      await client.query(
        `DELETE FROM doctor_availability WHERE doctor_id = $1 AND (location_id = $2 OR location_id IS NULL)`,
        [doctorId, targetLocationId],
      );
    } else {
      await client.query(
        `DELETE FROM doctor_availability WHERE doctor_id = $1`,
        [doctorId],
      );
    }

    for (const rule of rules) {
      const dayStr = DAY_MAP[rule.day_of_week];
      const statusStr = rule.is_active ? 'ACTIVE' : 'INACTIVE';

      const start = rule.start_time_1 || '09:00:00';
      const end = rule.end_time_1 === rule.start_time_1
        ? `${start.split(':')[0]}:59:00`
        : (rule.end_time_1 || '17:00:00');

      await client.query(
        `INSERT INTO doctor_availability 
          (id, doctor_id, location_id, day_of_week, start_time, end_time, status, slot_length, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now())`,
        [
          doctorId,
          targetLocationId || null,
          dayStr,
          start,
          end,
          statusStr,
          slotDurationMinutes || 30,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getBlockedDates(doctorId: string) {
  const result = await pool.query<{
    id: string;
    blocked_date: string;
    start_time: string;
    end_time: string;
    reason: string | null;
  }>(
    `SELECT id, blocked_date, start_time, end_time, reason
     FROM doctor_blocked_dates
     WHERE doctor_id = $1
     ORDER BY blocked_date ASC, start_time ASC`,
    [doctorId],
  );
  return result.rows;
}

export async function addBlockedDate(
  doctorId: string,
  blockedDate: string,
  startTime: string,
  endTime: string,
  reason?: string,
) {
  const result = await pool.query<{
    id: string;
    blocked_date: string;
    start_time: string;
    end_time: string;
    reason: string | null;
  }>(
    `INSERT INTO doctor_blocked_dates (doctor_id, blocked_date, start_time, end_time, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, blocked_date, start_time, end_time, reason`,
    [doctorId, blockedDate, startTime, endTime, reason ?? null],
  );
  return result.rows[0];
}

export async function updateBlockedDate(
  doctorId: string,
  blockId: string,
  blockedDate: string,
  startTime: string,
  endTime: string,
  reason?: string,
) {
  const result = await pool.query<{
    id: string;
    blocked_date: string;
    start_time: string;
    end_time: string;
    reason: string | null;
  }>(
    `UPDATE doctor_blocked_dates
     SET blocked_date = $3, start_time = $4, end_time = $5, reason = $6, updated_at = NOW()
     WHERE doctor_id = $1 AND id = $2
     RETURNING id, blocked_date, start_time, end_time, reason`,
    [doctorId, blockId, blockedDate, startTime, endTime, reason ?? null],
  );
  return result.rows[0];
}

export async function removeBlockedDate(doctorId: string, blockId: string) {
  await pool.query(
    `DELETE FROM doctor_blocked_dates WHERE doctor_id = $1 AND id = $2`,
    [doctorId, blockId],
  );
}

export async function getCustomAvailability(doctorId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM doctor_custom_availability
     WHERE doctor_id = $1 ORDER BY date ASC, start_time ASC`,
    [doctorId]
  );
  return rows;
}

export async function addCustomAvailability(data: {
  doctorId: string;
  date: string;
  locationId: string;
  startTime: string;
  endTime: string;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO doctor_custom_availability (doctor_id, date, location_id, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.doctorId, data.date, data.locationId, data.startTime, data.endTime]
  );
  return rows[0];
}

export async function updateCustomAvailability(id: string, data: {
  doctorId: string;
  date: string;
  locationId: string;
  startTime: string;
  endTime: string;
}): Promise<any> {
  const { rows } = await pool.query(
    `UPDATE doctor_custom_availability 
     SET date = $2, location_id = $3, start_time = $4, end_time = $5, updated_at = NOW()
     WHERE id = $1 AND doctor_id = $6 RETURNING *`,
    [id, data.date, data.locationId, data.startTime, data.endTime, data.doctorId]
  );
  return rows[0];
}

export async function deleteCustomAvailability(id: string, doctorId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM doctor_custom_availability WHERE id = $1 AND doctor_id = $2`,
    [id, doctorId]
  );
  return (rowCount ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Doctor-Initiated Reschedule Request Confirmation Methods
// ─────────────────────────────────────────────────────────────────────────────

export async function createRescheduleRequestTx(params: {
  appointmentId: string;
  doctorId: string;
  newSlotId: string;
  reason?: string | undefined;
}): Promise<AppointmentRescheduleRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and fetch current appointment
    const apptRes = await client.query<{
      id: string;
      doctor_id: string;
      patient_id: string;
      slot_id: string | null;
      status: string;
      scheduled_start: Date | string;
      scheduled_end: Date | string;
    }>(
      `SELECT id, doctor_id, patient_id, slot_id, status, scheduled_start, scheduled_end 
       FROM appointments 
       WHERE id = $1 AND status IN ('scheduled', 'confirmed', 'rescheduled')
       FOR UPDATE`,
      [params.appointmentId],
    );

    if (apptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentAppt = apptRes.rows[0]!;

    // 2. Validate slot availability for this doctor
    const newSlot = await getSlotById(params.newSlotId, currentAppt.doctor_id);
    if (!newSlot) {
      await client.query('ROLLBACK');
      return null;
    }

    const proposedStart = new Date(`${newSlot.slotTime}+05:30`);
    const proposedEnd = new Date(proposedStart.getTime() + 25 * 60 * 1000);

    // 3. Ensure no active appointment conflicts on proposed slot
    const conflictingAppt = await client.query<{ id: string }>(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
         AND id != $2
         AND status IN ('scheduled', 'confirmed', 'rescheduled')
         AND scheduled_start = $3`,
      [currentAppt.doctor_id, params.appointmentId, proposedStart.toISOString()],
    );

    if (conflictingAppt.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // 4. Ensure no OTHER pending reschedule request claims this proposed slot
    const conflictingRequest = await client.query<{ id: string }>(
      `SELECT id FROM appointment_reschedule_requests 
       WHERE doctor_id = $1 
         AND appointment_id != $2
         AND status = 'pending'
         AND expires_at > NOW()
         AND proposed_start = $3`,
      [currentAppt.doctor_id, params.appointmentId, proposedStart.toISOString()],
    );

    if (conflictingRequest.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // 5. Cancel any existing pending requests for THIS appointment
    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE (appointment_id = $1 OR id = $1) AND status = 'pending'`,
      [params.appointmentId],
    );

    // 6. Insert new pending request
    const insertRes = await client.query<{
      id: string;
      appointment_id: string;
      doctor_id: string;
      patient_id: string;
      proposed_slot_id: string;
      proposed_start: Date | string;
      proposed_end: Date | string;
      reason: string | null;
      status: string;
      created_at: Date | string;
      updated_at: Date | string;
      expires_at: Date | string;
    }>(
      `INSERT INTO appointment_reschedule_requests (
         appointment_id, doctor_id, patient_id, proposed_slot_id,
         proposed_start, proposed_end, reason, status, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW() + INTERVAL '48 hours')
       RETURNING *`,
      [
        params.appointmentId,
        currentAppt.doctor_id,
        currentAppt.patient_id,
        params.newSlotId,
        proposedStart.toISOString(),
        proposedEnd.toISOString(),
        params.reason ?? null,
      ],
    );

    await client.query('COMMIT');
    const r = insertRes.rows[0]!;
    return {
      id: r.id,
      appointmentId: r.appointment_id,
      doctorId: r.doctor_id,
      patientId: r.patient_id,
      proposedSlotId: r.proposed_slot_id,
      proposedStart: new Date(r.proposed_start).toISOString(),
      proposedEnd: new Date(r.proposed_end).toISOString(),
      reason: r.reason ?? undefined,
      status: r.status as any,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      expiresAt: new Date(r.expires_at).toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveRescheduleRequestByAppointmentId(
  appointmentId: string,
): Promise<AppointmentRescheduleRequest | null> {
  const { rows } = await pool.query<{
    id: string;
    appointment_id: string;
    doctor_id: string;
    patient_id: string;
    proposed_slot_id: string;
    proposed_start: Date | string;
    proposed_end: Date | string;
    reason: string | null;
    status: string;
    created_at: Date | string;
    updated_at: Date | string;
    expires_at: Date | string;
  }>(
    `SELECT * 
     FROM appointment_reschedule_requests 
     WHERE appointment_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [appointmentId],
  );

  if (rows.length === 0) return null;
  const r = rows[0]!;

  const expiresAt = new Date(r.expires_at);
  let status = r.status;
  if (status === 'pending' && expiresAt.getTime() <= Date.now()) {
    status = 'expired';
    void pool.query(
      `UPDATE appointment_reschedule_requests SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [r.id],
    );
  }

  return {
    id: r.id,
    appointmentId: r.appointment_id,
    doctorId: r.doctor_id,
    patientId: r.patient_id,
    proposedSlotId: r.proposed_slot_id,
    proposedStart: new Date(r.proposed_start).toISOString(),
    proposedEnd: new Date(r.proposed_end).toISOString(),
    reason: r.reason ?? undefined,
    status: status as any,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function confirmRescheduleRequestTx(params: {
  appointmentId: string;
  patientUserId: string;
}): Promise<Appointment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and fetch latest pending reschedule request
    const reqRes = await client.query<{
      id: string;
      appointment_id: string;
      doctor_id: string;
      patient_id: string;
      proposed_slot_id: string;
      proposed_start: Date | string;
      proposed_end: Date | string;
      reason: string | null;
      status: string;
      expires_at: Date | string;
    }>(
      `SELECT * FROM appointment_reschedule_requests 
       WHERE appointment_id = $1 AND status = 'pending'
       ORDER BY created_at DESC 
       LIMIT 1 
       FOR UPDATE`,
      [params.appointmentId],
    );

    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const reqRow = reqRes.rows[0]!;
    if (new Date(reqRow.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE appointment_reschedule_requests SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [reqRow.id],
      );
      await client.query('ROLLBACK');
      return null;
    }

    // 2. Lock appointment
    const apptRes = await client.query<{
      id: string;
      doctor_id: string;
      patient_id: string;
      status: string;
    }>(
      `SELECT id, doctor_id, patient_id, status 
       FROM appointments 
       WHERE id = $1 
       FOR UPDATE`,
      [reqRow.appointment_id],
    );

    if (apptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const apptRow = apptRes.rows[0]!;

    // 3. Verify slot still has no conflicting booked appointment
    const proposedStart = new Date(reqRow.proposed_start);
    const proposedEnd = new Date(reqRow.proposed_end);

    const conflicting = await client.query<{ id: string }>(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
         AND id != $2 
         AND status IN ('scheduled', 'confirmed', 'rescheduled')
         AND scheduled_start = $3`,
      [apptRow.doctor_id, reqRow.appointment_id, proposedStart.toISOString()],
    );

    if (conflicting.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // 4. Update appointment
    await client.query(
      `UPDATE appointments
       SET slot_id = $1,
           scheduled_start = $2,
           scheduled_end = $3,
           reschedule_reason = $4,
           status = 'rescheduled',
           updated_at = NOW()
       WHERE id = $5`,
      [
        reqRow.proposed_slot_id,
        proposedStart.toISOString(),
        proposedEnd.toISOString(),
        reqRow.reason ?? 'Rescheduled per doctor proposal',
        reqRow.appointment_id,
      ],
    );

    // 5. Update request status
    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    // 6. Audit history
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
       VALUES ($1, 'rescheduled', $2, $3)`,
      [
        reqRow.appointment_id,
        params.patientUserId,
        reqRow.reason ? `Patient confirmed doctor proposal: ${reqRow.reason}` : 'Patient confirmed doctor reschedule proposal',
      ],
    );

    await client.query('COMMIT');
    return await getAppointmentById(reqRow.appointment_id, params.patientUserId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function declineRescheduleRequestTx(params: {
  appointmentId: string;
  patientUserId: string;
  reason?: string | undefined;
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query<{ id: string; appointment_id: string }>(
      `SELECT id, appointment_id FROM appointment_reschedule_requests
       WHERE (appointment_id = $1 OR id = $1) AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [params.appointmentId],
    );

    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    const reqRow = reqRes.rows[0]!;

    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'declined', updated_at = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
       VALUES ($1, 'reschedule_declined', $2, $3)`,
      [
        reqRow.appointment_id,
        params.patientUserId,
        params.reason ?? 'Patient declined doctor reschedule proposal',
      ],
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function chooseAlternativeRescheduleSlotTx(params: {
  appointmentId: string;
  patientUserId: string;
  newSlotId: string;
  reason?: string | undefined;
}): Promise<Appointment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch and lock appointment
    const apptRes = await client.query<{
      id: string;
      doctor_id: string;
      patient_id: string;
      status: string;
    }>(
      `SELECT id, doctor_id, patient_id, status 
       FROM appointments 
       WHERE id = $1 
       FOR UPDATE`,
      [params.appointmentId],
    );

    if (apptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const appt = apptRes.rows[0]!;

    // 2. Mark any pending request as declined (releasing doctor's proposed slot)
    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'declined', updated_at = NOW()
       WHERE appointment_id = $1 AND status = 'pending'`,
      [params.appointmentId],
    );

    // 3. Resolve and validate new alternative slot
    const newSlot = await getSlotById(params.newSlotId, appt.doctor_id);
    if (!newSlot) {
      await client.query('ROLLBACK');
      return null;
    }

    const newStart = new Date(`${newSlot.slotTime}+05:30`);
    const newEnd = new Date(newStart.getTime() + 25 * 60 * 1000);

    // 4. Check conflicts for alternative slot
    const conflictingRes = await client.query<{ id: string }>(
      `SELECT id FROM appointments 
       WHERE doctor_id = $1 
         AND id != $2
         AND status IN ('scheduled', 'confirmed', 'rescheduled')
         AND scheduled_start = $3`,
      [newSlot.doctorId || appt.doctor_id, params.appointmentId, newStart.toISOString()],
    );

    if (conflictingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // 5. Update appointment with alternative slot
    await client.query(
      `UPDATE appointments
       SET slot_id = $1,
           scheduled_start = $2,
           scheduled_end = $3,
           reschedule_reason = $4,
           status = 'rescheduled',
           updated_at = NOW()
       WHERE id = $5`,
      [
        params.newSlotId,
        newStart.toISOString(),
        newEnd.toISOString(),
        params.reason ?? 'Patient selected alternative slot',
        params.appointmentId,
      ],
    );

    // 6. Audit trail
    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
       VALUES ($1, 'rescheduled', $2, $3)`,
      [
        params.appointmentId,
        params.patientUserId,
        params.reason ?? 'Patient selected alternative slot after declining doctor proposal',
      ],
    );

    await client.query('COMMIT');
    return await getAppointmentById(params.appointmentId, params.patientUserId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


export interface PendingRescheduleRequestItem {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  proposedSlotId: string;
  proposedStart: string;
  proposedEnd: string;
  reason: string | null;
  status: 'pending';
  isTemporarilyReserved: boolean;
  expiresAt: string;
  createdAt: string;
  supportedActions: Array<'ACCEPT_PROPOSED' | 'CHOOSE_ALTERNATIVE' | 'CANCEL_APPOINTMENT'>;
  originalAppointment: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    tokenNumber?: string | null;
    purpose?: string | null;
    status: string;
  };
  doctor: {
    id: string;
    name: string;
    specialty?: string | null;
    specialization?: string | null;
    clinicName?: string | null;
    clinicAddress?: string | null;
    profileImageUrl?: string | null;
  };
}

export async function getPendingRescheduleRequestsByPatient(
  patientUserId: string,
): Promise<PendingRescheduleRequestItem[]> {
  await pool.query(
    `UPDATE appointment_reschedule_requests SET status = 'expired', updated_at = NOW() WHERE status = 'pending' AND expires_at <= NOW()`,
  );

  const query = `
    SELECT 
      arr.id,
      arr.appointment_id AS "appointmentId",
      arr.doctor_id AS "doctorId",
      arr.patient_id AS "patientId",
      arr.proposed_slot_id AS "proposedSlotId",
      arr.proposed_start AS "proposedStart",
      arr.proposed_end AS "proposedEnd",
      arr.reason,
      arr.status,
      arr.created_at AS "createdAt",
      arr.updated_at AS "updatedAt",
      arr.expires_at AS "expiresAt",
      a.scheduled_start AS "origScheduledStart",
      a.scheduled_end AS "origScheduledEnd",
      a.token_number AS "tokenNumber",
      a.purpose AS "appointmentPurpose",
      a.status AS "appointmentStatus",
      d.id AS "docId",
      COALESCE(d.name, 'Dr. Bharathi') AS "doctorName",
      COALESCE(d.qualification, 'MBBS, DM (Medical Oncology)') AS "doctorSpecialty",
      COALESCE(d.specialization, 'Medical Oncology') AS "doctorSpecialization",
      COALESCE(h.name, d.clinic_address, 'Apollo Hospitals, Chennai') AS "clinicName",
      d.clinic_address AS "clinicAddress",
      d.profile_image_url AS "doctorProfileImageUrl"
    FROM appointment_reschedule_requests arr
    JOIN appointments a ON arr.appointment_id = a.id
    LEFT JOIN doctors d ON (arr.doctor_id = d.user_account_id OR arr.doctor_id = d.id)
    LEFT JOIN hospitals h ON d.hospital_id = h.id
    WHERE arr.status = 'pending'
      AND arr.expires_at > NOW()
      AND (
        arr.patient_id = $1 
        OR a.patient_id = $1
        OR arr.patient_id IN (SELECT id FROM patients WHERE user_account_id = $1 OR id = $1)
        OR a.patient_id IN (SELECT id FROM patients WHERE user_account_id = $1 OR id = $1)
        OR arr.patient_id IN (SELECT user_account_id FROM patients WHERE id = $1 OR user_account_id = $1)
        OR a.patient_id IN (SELECT user_account_id FROM patients WHERE id = $1 OR user_account_id = $1)
      )
    ORDER BY arr.created_at DESC
  `;

  const { rows } = await pool.query(query, [patientUserId]);

  return rows.map((r: any) => ({
    id: r.id,
    appointmentId: r.appointmentId,
    doctorId: r.doctorId,
    patientId: r.patientId,
    proposedSlotId: r.proposedSlotId,
    proposedStart: new Date(r.proposedStart).toISOString(),
    proposedEnd: new Date(r.proposedEnd).toISOString(),
    reason: r.reason ?? null,
    status: 'pending' as const,
    isTemporarilyReserved: true,
    expiresAt: new Date(r.expiresAt).toISOString(),
    createdAt: new Date(r.createdAt).toISOString(),
    supportedActions: ['ACCEPT_PROPOSED', 'CHOOSE_ALTERNATIVE', 'CANCEL_APPOINTMENT'] as const,
    originalAppointment: {
      id: r.appointmentId,
      scheduledStart: new Date(r.origScheduledStart).toISOString(),
      scheduledEnd: new Date(r.origScheduledEnd).toISOString(),
      tokenNumber: r.tokenNumber ?? null,
      purpose: r.appointmentPurpose ?? null,
      status: r.appointmentStatus || 'rescheduled',
    },
    doctor: {
      id: r.docId || r.doctorId,
      name: r.doctorName,
      specialty: r.doctorSpecialty,
      specialization: r.doctorSpecialization,
      clinicName: r.clinicName,
      clinicAddress: r.clinicAddress,
      profileImageUrl: r.doctorProfileImageUrl,
    },
  }));
}

export async function getDoctorRescheduleRequests(
  doctorId: string,
  filterStatus?: string,
): Promise<DoctorRescheduleRequestItem[]> {
  const params: any[] = [doctorId];
  let statusCondition = '';

  const normalizedStatus = (filterStatus || '').toLowerCase();
  if (normalizedStatus === 'pending') {
    statusCondition = "AND arr.status = 'pending' AND arr.expires_at > NOW()";
  } else if (normalizedStatus === 'confirmed') {
    statusCondition = "AND arr.status = 'confirmed'";
  } else if (normalizedStatus === 'cancelled') {
    statusCondition =
      "AND (arr.status IN ('cancelled', 'declined', 'expired') OR (arr.status = 'pending' AND arr.expires_at <= NOW()))";
  }

  const query = `
    SELECT 
      arr.id,
      arr.appointment_id AS "appointmentId",
      arr.doctor_id AS "doctorId",
      arr.patient_id AS "patientId",
      arr.proposed_slot_id AS "proposedSlotId",
      arr.proposed_start AS "proposedStart",
      arr.proposed_end AS "proposedEnd",
      arr.reason,
      arr.status,
      arr.created_at AS "createdAt",
      arr.updated_at AS "updatedAt",
      arr.expires_at AS "expiresAt",
      arr.last_reminder_sent_at AS "lastReminderSentAt",
      COALESCE(arr.reminder_count, 0) AS "reminderCount",
      a.scheduled_start AS "origScheduledStart",
      a.scheduled_end AS "origScheduledEnd",
      a.token_number AS "tokenNumber",
      a.purpose AS "appointmentPurpose",
      a.status AS "appointmentStatus",
      COALESCE(p.name, a.patient_name, 'Patient') AS "patientName",
      COALESCE(p.phone, '') AS "patientPhone",
      p.gender AS "patientGender",
      p.profile_image_url AS "patientProfileImageUrl"
    FROM appointment_reschedule_requests arr
    JOIN appointments a ON arr.appointment_id = a.id
    LEFT JOIN patients p ON (arr.patient_id = p.id OR arr.patient_id = p.user_account_id OR a.patient_id = p.id OR a.patient_id = p.user_account_id)
    WHERE (
      arr.doctor_id = $1 
      OR a.doctor_id = $1 
      OR arr.doctor_id IN (SELECT user_account_id FROM doctors WHERE id = $1)
      OR arr.doctor_id IN (SELECT id FROM doctors WHERE user_account_id = $1)
      OR a.doctor_id IN (SELECT user_account_id FROM doctors WHERE id = $1)
      OR a.doctor_id IN (SELECT id FROM doctors WHERE user_account_id = $1)
      OR arr.doctor_id IN (
        SELECT d2.id FROM doctors d1
        JOIN doctors d2 ON (d1.id = $1 OR d1.user_account_id = $1)
        WHERE (
          LOWER(TRIM(REPLACE(d2.name, 'Dr. ', ''))) = LOWER(TRIM(REPLACE(d1.name, 'Dr. ', '')))
          OR d1.name ILIKE 'admin%'
          OR d2.name ILIKE 'admin%'
        )
      )
      OR a.doctor_id IN (
        SELECT d2.id FROM doctors d1
        JOIN doctors d2 ON (d1.id = $1 OR d1.user_account_id = $1)
        WHERE (
          LOWER(TRIM(REPLACE(d2.name, 'Dr. ', ''))) = LOWER(TRIM(REPLACE(d1.name, 'Dr. ', '')))
          OR d1.name ILIKE 'admin%'
          OR d2.name ILIKE 'admin%'
        )
      )
    )
    ${statusCondition}
    ORDER BY arr.created_at DESC
  `;

  const { rows } = await pool.query(query, params);

  return rows.map((r: any) => {
    let currentStatus = r.status;
    const expiresAt = new Date(r.expiresAt);
    if (currentStatus === 'pending' && expiresAt.getTime() <= Date.now()) {
      currentStatus = 'expired';
    }

    return {
      id: r.id,
      appointmentId: r.appointmentId,
      doctorId: r.doctorId,
      patientId: r.patientId,
      patientName: r.patientName,
      patientPhone: r.patientPhone,
      patientGender: r.patientGender ?? undefined,
      patientProfileImageUrl: r.patientProfileImageUrl ?? undefined,
      proposedSlotId: r.proposedSlotId,
      proposedStart: new Date(r.proposedStart).toISOString(),
      proposedEnd: new Date(r.proposedEnd).toISOString(),
      origScheduledStart: new Date(r.origScheduledStart).toISOString(),
      origScheduledEnd: new Date(r.origScheduledEnd).toISOString(),
      tokenNumber: r.tokenNumber ?? null,
      appointmentPurpose: r.appointmentPurpose ?? null,
      reason: r.reason ?? undefined,
      status: currentStatus,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastReminderSentAt: r.lastReminderSentAt
        ? new Date(r.lastReminderSentAt).toISOString()
        : undefined,
      reminderCount: Number(r.reminderCount || 0),
    };
  });
}

export async function getPendingRescheduleRequestsCountByPatient(
  patientUserId: string,
): Promise<number> {
  await pool.query(
    `UPDATE appointment_reschedule_requests SET status = 'expired', updated_at = NOW() WHERE status = 'pending' AND expires_at <= NOW()`,
  );

  const query = `
    SELECT COUNT(arr.id)::int AS count
    FROM appointment_reschedule_requests arr
    JOIN appointments a ON arr.appointment_id = a.id
    WHERE arr.status = 'pending'
      AND arr.expires_at > NOW()
      AND (
        arr.patient_id = $1 
        OR a.patient_id = $1
        OR arr.patient_id IN (SELECT id FROM patients WHERE user_account_id = $1 OR id = $1)
        OR a.patient_id IN (SELECT id FROM patients WHERE user_account_id = $1 OR id = $1)
        OR arr.patient_id IN (SELECT user_account_id FROM patients WHERE id = $1 OR user_account_id = $1)
        OR a.patient_id IN (SELECT user_account_id FROM patients WHERE id = $1 OR user_account_id = $1)
      )
  `;
  const { rows } = await pool.query<{ count: number }>(query, [patientUserId]);
  return rows[0]?.count ?? 0;
}

export async function sendRescheduleReminderTx(params: {
  requestId: string;
  doctorId: string;
}): Promise<{
  request: DoctorRescheduleRequestItem;
  patientUserId: string;
} | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch request with lock
    const checkRes = await client.query(
      `SELECT 
         arr.*,
         a.scheduled_start AS orig_scheduled_start,
         a.scheduled_end AS orig_scheduled_end,
         a.token_number,
         a.purpose,
         COALESCE(p.name, a.patient_name, 'Patient') AS patient_name,
         COALESCE(p.phone, '') AS patient_phone,
         p.gender AS patient_gender,
         p.profile_image_url AS patient_profile_image_url,
         COALESCE(p.user_account_id, p.id, arr.patient_id) AS target_user_id
       FROM appointment_reschedule_requests arr
       JOIN appointments a ON arr.appointment_id = a.id
       LEFT JOIN patients p ON (arr.patient_id = p.id OR arr.patient_id = p.user_account_id OR a.patient_id = p.id OR a.patient_id = p.user_account_id)
       WHERE arr.id = $1
         AND (
           arr.doctor_id = $2 
           OR a.doctor_id = $2 
           OR arr.doctor_id IN (SELECT user_account_id FROM doctors WHERE id = $2)
           OR arr.doctor_id IN (SELECT id FROM doctors WHERE user_account_id = $2)
           OR a.doctor_id IN (SELECT user_account_id FROM doctors WHERE id = $2)
           OR a.doctor_id IN (SELECT id FROM doctors WHERE user_account_id = $2)
           OR arr.doctor_id IN (
             SELECT d2.id FROM doctors d1
             JOIN doctors d2 ON (d1.id = $2 OR d1.user_account_id = $2)
             WHERE (
               LOWER(TRIM(REPLACE(d2.name, 'Dr. ', ''))) = LOWER(TRIM(REPLACE(d1.name, 'Dr. ', '')))
               OR d1.name ILIKE 'admin%'
               OR d2.name ILIKE 'admin%'
             )
           )
           OR a.doctor_id IN (
             SELECT d2.id FROM doctors d1
             JOIN doctors d2 ON (d1.id = $2 OR d1.user_account_id = $2)
             WHERE (
               LOWER(TRIM(REPLACE(d2.name, 'Dr. ', ''))) = LOWER(TRIM(REPLACE(d1.name, 'Dr. ', '')))
               OR d1.name ILIKE 'admin%'
               OR d2.name ILIKE 'admin%'
             )
           )
         )
       FOR UPDATE OF arr`,
      [params.requestId, params.doctorId],
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const row = checkRes.rows[0];

    // Must be pending and not expired
    if (row.status !== 'pending' || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return null;
    }

    // Update reminder info
    const updateRes = await client.query(
      `UPDATE appointment_reschedule_requests
       SET last_reminder_sent_at = NOW(),
           reminder_count = COALESCE(reminder_count, 0) + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [params.requestId],
    );

    await client.query('COMMIT');

    const updated = updateRes.rows[0];
    const expiresAt = new Date(updated.expires_at);

    return {
      patientUserId: String(row.target_user_id || row.patient_id),
      request: {
        id: updated.id,
        appointmentId: updated.appointment_id,
        doctorId: updated.doctor_id,
        patientId: updated.patient_id,
        patientName: row.patient_name,
        patientPhone: row.patient_phone,
        patientGender: row.patient_gender ?? undefined,
        patientProfileImageUrl: row.patient_profile_image_url ?? undefined,
        proposedSlotId: updated.proposed_slot_id,
        proposedStart: new Date(updated.proposed_start).toISOString(),
        proposedEnd: new Date(updated.proposed_end).toISOString(),
        origScheduledStart: new Date(row.orig_scheduled_start).toISOString(),
        origScheduledEnd: new Date(row.orig_scheduled_end).toISOString(),
        tokenNumber: row.token_number ?? null,
        appointmentPurpose: row.purpose ?? null,
        reason: updated.reason ?? undefined,
        status: updated.status,
        createdAt: new Date(updated.created_at).toISOString(),
        updatedAt: new Date(updated.updated_at).toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastReminderSentAt: updated.last_reminder_sent_at
          ? new Date(updated.last_reminder_sent_at).toISOString()
          : undefined,
        reminderCount: Number(updated.reminder_count || 0),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function withdrawRescheduleRequestTx(params: {
  appointmentId: string;
  doctorUserId: string;
  reason?: string | undefined;
}): Promise<AppointmentRescheduleRequest | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query<{
      id: string;
      appointment_id: string;
      doctor_id: string;
      patient_id: string;
      proposed_slot_id: string;
      proposed_start: Date | string;
      proposed_end: Date | string;
      reason: string | null;
      status: string;
      expires_at: Date | string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT arr.*
       FROM appointment_reschedule_requests arr
       WHERE (arr.appointment_id = $1 OR arr.id = $1)
         AND arr.status = 'pending'
       ORDER BY arr.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [params.appointmentId],
    );

    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const reqRow = reqRes.rows[0]!;

    const docCheck = await client.query<{ id: string }>(
      `SELECT id FROM doctors WHERE (id = $1 OR user_account_id = $1) AND (id = $2 OR user_account_id = $2)`,
      [params.doctorUserId, reqRow.doctor_id],
    );

    if (docCheck.rows.length === 0 && reqRow.doctor_id !== params.doctorUserId) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE appointment_reschedule_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [reqRow.id],
    );

    await client.query(
      `INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes)
       VALUES ($1, 'reschedule_withdrawn', $2, $3)`,
      [
        reqRow.appointment_id,
        params.doctorUserId,
        params.reason ? `Doctor withdrew reschedule proposal: ${params.reason}` : 'Doctor withdrew reschedule proposal',
      ],
    );

    await client.query('COMMIT');
    return {
      id: reqRow.id,
      appointmentId: reqRow.appointment_id,
      doctorId: reqRow.doctor_id,
      patientId: reqRow.patient_id,
      proposedSlotId: reqRow.proposed_slot_id,
      proposedStart: new Date(reqRow.proposed_start).toISOString(),
      proposedEnd: new Date(reqRow.proposed_end).toISOString(),
      reason: reqRow.reason ?? undefined,
      status: 'cancelled',
      createdAt: new Date(reqRow.created_at).toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(reqRow.expires_at).toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function sweepExpiredRescheduleRequests(): Promise<
  Array<{
    id: string;
    appointmentId: string;
    patientId: string;
    doctorId: string;
    proposedStart: string;
    proposedEnd: string;
  }>
> {
  const { rows } = await pool.query<{
    id: string;
    appointment_id: string;
    patient_id: string;
    doctor_id: string;
    proposed_start: Date | string;
    proposed_end: Date | string;
  }>(
    `UPDATE appointment_reschedule_requests
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at <= NOW()
     RETURNING id, appointment_id, patient_id, doctor_id, proposed_start, proposed_end`,
  );

  return rows.map(r => ({
    id: r.id,
    appointmentId: r.appointment_id,
    patientId: r.patient_id,
    doctorId: r.doctor_id,
    proposedStart: new Date(r.proposed_start).toISOString(),
    proposedEnd: new Date(r.proposed_end).toISOString(),
  }));
}
