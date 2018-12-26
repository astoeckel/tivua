/*
 *  TIVUA -- Shared research blog
 *  Copyright (C) 2019  Andreas Stöckel
 *
 *  https://github.com/astoeckel/tivua
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

this.tivua = this.tivua || {};
this.tivua.time = (function () {
	"use strict";

	const month_names = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec"
	];

	function date_to_week_number(d) {
		/* See https://stackoverflow.com/a/6117889 */
		// Copy date so don't modify original
		d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
		// Set to nearest Thursday: current date + 4 - current day number
		// Make Sunday's day number 7
		d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
		// Get first day of year
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
		// Calculate full weeks to nearest Thursday
		const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
		// Return array of year and week number
		return [weekNo, d.getUTCFullYear()];
	}

	function week_number_to_date(week, year, weekDay) {
		/* https://stackoverflow.com/a/45592631 */
		const getZeroBasedIsoWeekDay = date => (date.getUTCDay() + 6) % 7
		const getIsoWeekDay = date => getZeroBasedIsoWeekDay(date) + 1

		const zeroBasedWeek = week - 1
		const zeroBasedWeekDay = weekDay - 1
		let days = (zeroBasedWeek * 7) + zeroBasedWeekDay

		// Dates start at 2017-01-01 and not 2017-01-00
		days += 1

		const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
		const firstIsoWeekDay = getIsoWeekDay(firstDayOfYear)
		const zeroBasedFirstIsoWeekDay = getZeroBasedIsoWeekDay(firstDayOfYear)

		// If year begins with W52 or W53
		if (firstIsoWeekDay > 4) {
			days += 8 - firstIsoWeekDay;
		} else {
			// Else begins with W01
			days -= zeroBasedFirstIsoWeekDay
		}
		return new Date(Date.UTC(year, 0, days));
	}

	return {
		"month_names": month_names,
		"date_to_week_number": date_to_week_number,
		"week_number_to_date": week_number_to_date
	}
})();
