// Grocery aisles: the fixed list, a keyword guess from an item's name, and grouping.

export const AISLES = [
	'Produce',
	'Meat and fish',
	'Dairy and eggs',
	'Bakery',
	'Pantry',
	'Spices and oils',
	'Frozen',
	'Other'
] as const;

export type Aisle = (typeof AISLES)[number];

export const isAisle = (value: string): value is Aisle =>
	(AISLES as readonly string[]).includes(value);

// prettier-ignore
const KEYWORDS: Record<Exclude<Aisle, 'Other'>, string[]> = {
	Produce: [
		'apple', 'apples', 'avocado', 'avocados', 'banana', 'bananas', 'basil', 'bell pepper',
		'bell peppers', 'berries', 'blueberries', 'broccoli', 'cabbage', 'carrot', 'carrots',
		'cauliflower', 'celery', 'chive', 'chives', 'cilantro', 'corn', 'cucumber', 'cucumbers',
		'dill', 'eggplant', 'garlic', 'ginger', 'grapes', 'green beans', 'green onion',
		'green onions', 'jalapeno', 'jalapenos', 'kale', 'leek', 'leeks', 'lemon', 'lemons',
		'lettuce', 'lime', 'limes', 'mango', 'mint', 'mixed greens', 'mushroom', 'mushrooms',
		'onion', 'onions', 'orange', 'oranges', 'parsley', 'pear', 'pears', 'potato', 'potatoes',
		'red pepper', 'rosemary', 'scallion', 'scallions', 'shallot', 'shallots', 'spinach',
		'squash', 'strawberries', 'sweet potato', 'sweet potatoes', 'thyme', 'tomato', 'tomatoes',
		'zucchini'
	],
	'Meat and fish': [
		'bacon', 'beef', 'chicken', 'chorizo', 'cod', 'fish', 'ground beef', 'ground pork',
		'ground turkey', 'ham', 'lamb', 'pork', 'prosciutto', 'salmon', 'sausage', 'sausages',
		'shrimp', 'steak', 'tilapia', 'tuna', 'turkey'
	],
	'Dairy and eggs': [
		'butter', 'buttermilk', 'cheddar', 'cheese', 'cottage cheese', 'cream', 'cream cheese',
		'egg', 'eggs', 'feta', 'greek yogurt', 'half and half', 'heavy cream', 'milk',
		'mozzarella', 'parmesan', 'ricotta', 'sour cream', 'yogurt'
	],
	Bakery: [
		'bagel', 'bagels', 'baguette', 'bread', 'buns', 'ciabatta', 'naan', 'pita', 'rolls',
		'sourdough', 'tortilla', 'tortillas'
	],
	Pantry: [
		'beans', 'beef broth', 'beef stock', 'black beans', 'breadcrumbs', 'broth', 'brown sugar',
		'canned tomatoes', 'chicken broth', 'chicken stock', 'chickpeas', 'coconut milk',
		'couscous', 'crushed tomatoes', 'diced tomatoes', 'egg noodles', 'flour',
		'honey', 'kidney beans', 'lentils', 'maple syrup', 'noodles', 'oats', 'pasta',
		'peanut butter', 'quinoa', 'rice', 'soy sauce', 'spaghetti', 'stock', 'sugar',
		'tomato paste', 'tomato sauce', 'vegetable broth', 'vegetable stock', 'vinegar'
	],
	'Spices and oils': [
		'baking powder', 'baking soda', 'bay leaf', 'bay leaves', 'black pepper', 'cayenne',
		'chili powder', 'cinnamon', 'cooking spray', 'cumin', 'curry powder', 'garlic powder',
		'nutmeg', 'oil', 'olive oil', 'onion powder', 'oregano', 'paprika', 'pepper',
		'red pepper flakes', 'salt', 'sesame oil', 'smoked paprika', 'turmeric', 'vanilla',
		'vanilla extract', 'vegetable oil'
	],
	Frozen: ['frozen', 'ice cream', 'frozen peas', 'frozen corn']
};

/** Every keyword with its aisle, longest phrase first so "black pepper" wins over "pepper". */
const PHRASES: [string[], Aisle][] = Object.entries(KEYWORDS)
	.flatMap(([aisle, words]) =>
		words.map((w) => [w.split(' '), aisle as Aisle] as [string[], Aisle])
	)
	.sort((a, b) => b[0].length - a[0].length);

const containsPhrase = (words: string[], phrase: string[]) => {
	for (let i = 0; i + phrase.length <= words.length; i++) {
		if (phrase.every((p, j) => words[i + j] === p)) return true;
	}
	return false;
};

/** Guesses an aisle from whole words in the name; Other when nothing matches. */
export const guessAisle = (name: string): Aisle => {
	const words = name
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
	for (const [phrase, aisle] of PHRASES) {
		if (containsPhrase(words, phrase)) return aisle;
	}
	return 'Other';
};

/** The remembered choice for this name, else the food's aisle (when it is one of ours), else a guess. */
export const aisleFor = (
	name: string,
	nameKey: string,
	foodAisle: string | null,
	choices: ReadonlyMap<string, string>
): Aisle => {
	const chosen = choices.get(nameKey);
	if (chosen && isAisle(chosen)) return chosen;
	const food = foodAisle && AISLES.find((a) => a.toLowerCase() === foodAisle.trim().toLowerCase());
	return food || guessAisle(name);
};

export interface AisleSection<T> {
	aisle: Aisle;
	items: T[];
}

/** Sections in aisle order, empty aisles dropped, items by name within each. */
export const groupByAisle = <T extends { name: string; aisle: Aisle }>(
	items: T[]
): AisleSection<T>[] =>
	AISLES.map((aisle) => ({
		aisle,
		items: items
			.filter((i) => i.aisle === aisle)
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
	})).filter((s) => s.items.length > 0);
