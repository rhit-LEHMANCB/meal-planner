// Assembles what the Nutrition page shows from planned entries, log entries and goals. Pure.
import {
	dayTotals,
	goalProgress,
	weekAverage,
	type DayNutrition,
	type EntryNutrition,
	type GoalProgress,
	type Macros,
	type NutritionGoals
} from './nutrition';

export interface ViewLog {
	id: string;
	date: string;
	slot: string | null;
	label: string;
	macros: Macros;
}

export interface NutritionView {
	days: DayNutrition[];
	average: Macros | null;
	/** Today's progress, when the week holds today. */
	today: {
		date: string;
		kcal: GoalProgress;
		proteinG: GoalProgress;
		carbsG: GoalProgress;
		fatG: GoalProgress;
		partial: boolean;
	} | null;
	/** The chart's top value in kcal: room for the goal line and the biggest day. */
	chartMax: number;
	logsByDay: { date: string; logs: ViewLog[] }[];
	empty: boolean;
}

export const buildNutritionView = (input: {
	days: string[];
	today: string;
	planned: { date: string; nutrition: EntryNutrition }[];
	logs: ViewLog[];
	goals: NutritionGoals;
}): NutritionView => {
	const days = dayTotals(input.days, input.planned, input.logs);
	const todayDay = days.find((d) => d.date === input.today);
	const biggest = Math.max(0, ...days.map((d) => d.total.kcal));
	return {
		days,
		average: weekAverage(days),
		today: todayDay
			? {
					date: todayDay.date,
					kcal: goalProgress(todayDay.total.kcal, input.goals.kcal),
					proteinG: goalProgress(todayDay.total.proteinG, input.goals.proteinG),
					carbsG: goalProgress(todayDay.total.carbsG, input.goals.carbsG),
					fatG: goalProgress(todayDay.total.fatG, input.goals.fatG),
					partial: todayDay.partial
				}
			: null,
		chartMax: Math.max(input.goals.kcal * 1.25, biggest * 1.1, 1),
		logsByDay: input.days
			.map((date) => ({ date, logs: input.logs.filter((l) => l.date === date) }))
			.filter((d) => d.logs.length > 0),
		empty: days.every((d) => !d.hasEntries)
	};
};
