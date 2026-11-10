import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SlotCell from './SlotCell.svelte';
import { RECIPE_DRAG_TYPE, type PlanEntry } from '$lib/domain/plan';

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
	id: 'e1',
	date: '2026-10-24',
	slot: 'lunch',
	kind: 'cook',
	title: 'Turkey chili',
	servings: 2,
	cooked: 6,
	drawn: 0,
	batchId: 'b1',
	eatBy: null,
	pastEatBy: false,
	gone: false,
	foodId: null,
	amount: null,
	unit: null,
	units: [],
	...over
});

const props = (over: Record<string, unknown> = {}) => ({
	date: '2026-10-24',
	slot: 'lunch' as const,
	where: 'Sat lunch',
	entries: [] as PlanEntry[],
	onadd: vi.fn(),
	onedit: vi.fn(),
	onneedsconfirm: vi.fn(),
	...over
});

const drop = (el: Element, types: Record<string, string>) => {
	const data = new DataTransfer();
	for (const [type, value] of Object.entries(types)) data.setData(type, value);
	el.dispatchEvent(
		new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true })
	);
	el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
};

describe('SlotCell', () => {
	it('shows each kind of entry with its amount', async () => {
		const screen = render(SlotCell, {
			props: props({
				entries: [
					entry({}),
					entry({ id: 'e2', kind: 'leftover', servings: 1, eatBy: '2026-10-23', pastEatBy: true }),
					entry({ id: 'e3', kind: 'food', title: 'Greek yogurt', amount: 170, unit: 'g' })
				]
			})
		});
		await expect.element(screen.getByText('cook 6 · eat 2')).toBeVisible();
		await expect.element(screen.getByText('Past eat-by (Fri)')).toBeVisible();
		await expect.element(screen.getByText('170 g')).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Remove leftover Turkey chili, Sat lunch' }))
			.toBeVisible();
	});

	it('marks a leftover from a thrown-out batch as gone', async () => {
		const screen = render(SlotCell, {
			props: props({ entries: [entry({ kind: 'leftover', servings: 1, gone: true })] })
		});
		await expect.element(screen.getByText('Thrown out')).toBeVisible();
	});

	it('opens the dialog from Add and from an entry', async () => {
		const p = props({ entries: [entry({})] });
		const screen = render(SlotCell, { props: p });
		await screen.getByRole('button', { name: 'Add to Sat lunch' }).click();
		expect(p.onadd).toHaveBeenCalledWith('2026-10-24', 'lunch');
		await screen.getByRole('button', { name: 'Edit Turkey chili, Sat lunch' }).click();
		expect(p.onedit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
	});

	it('takes a recipe dropped from the shelf when droppable', async () => {
		const p = props({ droppable: true });
		const screen = render(SlotCell, { props: p });
		drop(screen.container.querySelector('[data-slot]')!, { [RECIPE_DRAG_TYPE]: 'r-chicken' });
		expect(p.onadd).toHaveBeenCalledWith('2026-10-24', 'lunch', 'r-chicken');
	});

	it('ignores drops on phones and drops that are not recipes', async () => {
		const phone = props();
		const a = render(SlotCell, { props: phone });
		drop(a.container.querySelector('[data-slot]')!, { [RECIPE_DRAG_TYPE]: 'r-chicken' });
		const other = props({ droppable: true });
		const b = render(SlotCell, { props: other });
		drop(b.container.querySelector('[data-slot]')!, { 'text/plain': 'hello' });
		expect(phone.onadd).not.toHaveBeenCalled();
		expect(other.onadd).not.toHaveBeenCalled();
	});
});
