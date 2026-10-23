// Week math, slot order and leftover rules for the weekly plan. Dates are ISO `YYYY-MM-DD` strings
// computed in UTC, so no time zone can shift a day.

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
	breakfast: 'Breakfast',
	lunch: 'Lunch',
	dinner: 'Dinner',
	snack: 'Snack'
};

/** Leftovers are good for this many days after cooking. */
export const EAT_BY_DAYS = 4;

/** Batches that left the fridge this many days ago or less are still listed on the leftovers page. */
export const GONE_LIST_DAYS = 14;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export const isSlot = (value: unknown): value is Slot =>
	typeof value === 'string' && (SLOTS as readonly string[]).includes(value);

/** A real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30). */
export const isIsoDate = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	!Number.isNaN(toDate(value).getTime()) &&
	toIso(toDate(value)) === value;

export const todayIso = (now: Date = new Date()) => toIso(now);

export const addDays = (iso: string, days: number) => {
	const date = toDate(iso);
	date.setUTCDate(date.getUTCDate() + days);
	return toIso(date);
};

export const mondayOf = (iso: string) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));

/** The seven dates of the week starting on `monday`. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * Reads `?week=`. No value or an invalid one gives the week containing `today`. A valid date that is
 * not a Monday gives its week with `redirect` set, so the address can be made canonical.
 */
export const parseWeekParam = (
	value: string | null,
	today: string
): { monday: string; redirect: boolean } => {
	if (!isIsoDate(value)) return { monday: mondayOf(today), redirect: false };
	const monday = mondayOf(value);
	return { monday, redirect: monday !== value };
};

export const slotIndex = (slot: Slot) => SLOTS.indexOf(slot);

export interface SlotRef {
	date: string;
	slot: Slot;
}

/** True when `at` comes after the cook: a later date, or the same date in a later slot. */
export const isAfterCook = (cook: SlotRef, at: SlotRef) =>
	at.date > cook.date || (at.date === cook.date && slotIndex(at.slot) > slotIndex(cook.slot));

export const eatByFor = (cookedOn: string) => addDays(cookedOn, EAT_BY_DAYS);

export const isPastEatBy = (eatBy: string | null, date: string) => eatBy !== null && date > eatBy;

export type BatchState = 'fridge' | 'finished' | 'thrown_out';

export interface BatchStateInput {
	free: number;
	thrownOut: boolean;
	/** Dates of the leftovers planned from the batch. */
	drawDates: string[];
}

/**
 * Thrown out, finished (nothing free and every planned leftover is before today), or still in the
 * fridge.
 */
export const batchState = (
	{ free, thrownOut, drawDates }: BatchStateInput,
	today: string
): BatchState => {
	if (thrownOut) return 'thrown_out';
	if (free === 0 && drawDates.every((date) => date < today)) return 'finished';
	return 'fridge';
};

/** The day a finished batch left the fridge: its last planned leftover, or the cook day. */
export const finishedOn = (cookedOn: string, drawDates: string[]) =>
	drawDates.reduce((last, date) => (date > last ? date : last), cookedOn);

/** "Mon" */
export const dayName = (iso: string) => DAY_NAMES[toDate(iso).getUTCDay()];

/** "Oct 19" */
export const monthDay = (iso: string) => {
	const date = toDate(iso);
	return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/** "Oct 19 – 25", or "Oct 26 – Nov 1" across a month. */
export const weekLabel = (monday: string) => {
	const sunday = addDays(monday, 6);
	const end =
		toDate(sunday).getUTCMonth() === toDate(monday).getUTCMonth()
			? String(toDate(sunday).getUTCDate())
			: monthDay(sunday);
	return `${monthDay(monday)} – ${end}`;
};
