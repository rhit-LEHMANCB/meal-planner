import { describe, expect, it } from 'vitest';
import {
	addDays,
	batchState,
	eatByFor,
	finishedOn,
	isAfterCook,
	isIsoDate,
	isPastEatBy,
	mondayOf,
	parseWeekParam,
	weekDays,
	weekLabel
} from './plan';

describe('dates', () => {
	it('accepts only real ISO dates', () => {
		expect(isIsoDate('2026-10-19')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('2026-10-19T00:00')).toBe(false);
		expect(isIsoDate('soon')).toBe(false);
		expect(isIsoDate(null)).toBe(false);
	});

	it('adds days across months, years and the DST change', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
		expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
	});

	it('finds the Monday of a week', () => {
		expect(mondayOf('2026-10-19')).toBe('2026-10-19');
		expect(mondayOf('2026-10-23')).toBe('2026-10-19');
		expect(mondayOf('2026-10-25')).toBe('2026-10-19');
		expect(mondayOf('2027-01-01')).toBe('2026-12-28');
	});

	it('lists the seven days of a week', () => {
		expect(weekDays('2026-10-26')).toEqual([
			'2026-10-26',
			'2026-10-27',
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
			'2026-11-01'
		]);
	});

	it('labels a week', () => {
		expect(weekLabel('2026-10-19')).toBe('Oct 19 – 25');
		expect(weekLabel('2026-10-26')).toBe('Oct 26 – Nov 1');
	});
});

describe('parseWeekParam', () => {
	const today = '2026-10-23';

	it('defaults to the current week', () => {
		expect(parseWeekParam(null, today)).toEqual({ monday: '2026-10-19', redirect: false });
	});

	it('ignores an invalid week', () => {
		expect(parseWeekParam('next', today)).toEqual({ monday: '2026-10-19', redirect: false });
	});

	it('redirects a date that is not a Monday to its week', () => {
		expect(parseWeekParam('2026-10-29', today)).toEqual({ monday: '2026-10-26', redirect: true });
	});

	it('keeps a Monday as is', () => {
		expect(parseWeekParam('2026-10-26', today)).toEqual({ monday: '2026-10-26', redirect: false });
	});
});

describe('isAfterCook', () => {
	const cook = { date: '2026-10-19', slot: 'dinner' } as const;

	it('allows a later date in any slot', () => {
		expect(isAfterCook(cook, { date: '2026-10-20', slot: 'breakfast' })).toBe(true);
	});

	it('allows the same day only in a later slot', () => {
		expect(isAfterCook(cook, { date: '2026-10-19', slot: 'snack' })).toBe(true);
		expect(isAfterCook(cook, { date: '2026-10-19', slot: 'dinner' })).toBe(false);
		expect(isAfterCook(cook, { date: '2026-10-19', slot: 'lunch' })).toBe(false);
	});

	it('refuses an earlier date', () => {
		expect(isAfterCook(cook, { date: '2026-10-18', slot: 'snack' })).toBe(false);
	});
});

describe('eat-by', () => {
	it('is four days after cooking', () => {
		expect(eatByFor('2026-10-19')).toBe('2026-10-23');
		expect(eatByFor('2026-12-30')).toBe('2027-01-03');
	});

	it('is past only after the eat-by day', () => {
		expect(isPastEatBy('2026-10-23', '2026-10-23')).toBe(false);
		expect(isPastEatBy('2026-10-23', '2026-10-24')).toBe(true);
		expect(isPastEatBy(null, '2030-01-01')).toBe(false);
	});
});

describe('batchState', () => {
	const today = '2026-10-23';

	it('is thrown out once thrown out', () => {
		expect(batchState({ free: 2, thrownOut: true, drawDates: [] }, today)).toBe('thrown_out');
	});

	it('is in the fridge while servings are free', () => {
		expect(batchState({ free: 1, thrownOut: false, drawDates: ['2026-10-01'] }, today)).toBe(
			'fridge'
		);
	});

	it('is in the fridge while a leftover is planned today or later', () => {
		expect(batchState({ free: 0, thrownOut: false, drawDates: ['2026-10-23'] }, today)).toBe(
			'fridge'
		);
	});

	it('is finished when nothing is free and every leftover is past', () => {
		expect(
			batchState({ free: 0, thrownOut: false, drawDates: ['2026-10-20', '2026-10-22'] }, today)
		).toBe('finished');
		expect(batchState({ free: 0, thrownOut: false, drawDates: [] }, today)).toBe('finished');
	});

	it('dates a finished batch by its last leftover', () => {
		expect(finishedOn('2026-10-19', ['2026-10-21', '2026-10-20'])).toBe('2026-10-21');
		expect(finishedOn('2026-10-19', [])).toBe('2026-10-19');
	});
});
