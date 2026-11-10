import { describe, expect, it } from 'vitest';
import {
	parseAisleForm,
	parseExtraForm,
	parseExtraTickForm,
	parseRemoveForm,
	parseTickForm
} from './grocery-form';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
};

const ID = '6f1c1a52-6d0f-4d38-9a5c-2b0e7d0f8a11';

describe('parseTickForm', () => {
	it('reads a key and the state to set', () => {
		expect(parseTickForm(form({ key: 'onion', checked: 'true' }))).toEqual({
			ok: true,
			value: { key: 'onion', checked: true }
		});
		expect(parseTickForm(form({ key: 'onion', checked: 'false' }))).toMatchObject({
			value: { checked: false }
		});
	});

	it('refuses a missing key or state', () => {
		expect(parseTickForm(form({ checked: 'true' }))).toMatchObject({ ok: false });
		expect(parseTickForm(form({ key: 'onion', checked: 'toggle' }))).toMatchObject({
			ok: false,
			errors: { checked: expect.any(String) }
		});
		expect(parseTickForm(form({ key: 'x'.repeat(201), checked: 'true' }))).toMatchObject({
			ok: false
		});
	});
});

describe('parseExtraForm', () => {
	it('reads an amount when one leads', () => {
		expect(parseExtraForm(form({ text: '2 paper towels' }))).toEqual({
			ok: true,
			value: { name: 'paper towels', quantity: 2, unit: null }
		});
		expect(parseExtraForm(form({ text: '1 gallon milk' }))).toEqual({
			ok: true,
			value: { name: 'milk', quantity: 1, unit: 'gallon' }
		});
	});

	it('works without an amount', () => {
		expect(parseExtraForm(form({ text: 'Dish soap' }))).toEqual({
			ok: true,
			value: { name: 'Dish soap', quantity: null, unit: null }
		});
	});

	it('refuses blank, too long or amount-only text', () => {
		expect(parseExtraForm(form({ text: '   ' }))).toEqual({
			ok: false,
			errors: { text: 'Enter an item to add.' }
		});
		expect(parseExtraForm(form({ text: 'a'.repeat(201) }))).toMatchObject({ ok: false });
		expect(parseExtraForm(form({ text: 'a'.repeat(200) }))).toMatchObject({ ok: true });
		expect(parseExtraForm(form({ text: '2' }))).toMatchObject({ ok: false });
	});
});

describe('item id forms', () => {
	it('need a uuid', () => {
		expect(parseRemoveForm(form({ id: ID }))).toEqual({ ok: true, value: { id: ID } });
		expect(parseRemoveForm(form({ id: 'nope' }))).toMatchObject({ ok: false });
		expect(parseExtraTickForm(form({ id: ID, checked: 'true' }))).toEqual({
			ok: true,
			value: { id: ID, checked: true }
		});
	});
});

describe('parseAisleForm', () => {
	it('accepts a listed aisle only', () => {
		expect(parseAisleForm(form({ key: 'gochujang', aisle: 'Pantry' }))).toEqual({
			ok: true,
			value: { key: 'gochujang', aisle: 'Pantry' }
		});
		expect(parseAisleForm(form({ key: 'gochujang', aisle: 'Garage' }))).toMatchObject({
			ok: false,
			errors: { aisle: 'Pick an aisle from the list.' }
		});
	});
});
