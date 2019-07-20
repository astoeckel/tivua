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
this.tivua.colors = (function () {
	"use strict";

	/* HSL color palette used for the entires. For each user, the hue value
	   is pseudo-randomly generated. The S/L entries are computed by linear
	   interpolation between the palette entries. */
	const author_colors_hsl = [
		[0, 255, 82],
		[19, 255, 90],
		[35, 255, 90],
		[52, 236, 80],
		[64, 236, 80],
		[127, 157, 84],
		[153, 157, 84],
		[204, 81, 78],
		[245, 155, 89],
		[256, 255, 82],
	];

	function author_id_to_hue(id) {
		// Compute the hue using the golden ratio
		const gr = 1.618033987;
		return ((256 * id * gr + 120) | 0) % 256;
	}

	function author_id_to_color(id, is_bg) {
		// Linearly interpolate between the colors from the palette stored in
		// author_colors_hsl based on the computed hue value
		let h = author_id_to_hue(id);
		for (let i = 0; i < author_colors_hsl.length - 1; i++) {
			if (author_colors_hsl[i + 1][0] >= h) {
				const c0 = author_colors_hsl[i + 0];
				const c1 = author_colors_hsl[i + 1];
				const dh0 = c0[0] - h;
				const dh1 = h - c1[0];
				const d = dh0 + dh1;
				const s = c0[1] * dh1 / d + c1[1] * dh0 / d;
				const l = c0[2] * dh1 / d + c1[2] * dh0 / d;
				if (is_bg) {
					return "hsl("
							+ ((h * 360 / 255) | 0) + ","
							+ ((s * 100 / 255) | 0) + "%,"
							+ ((l * 100 / 255) | 0) + "%)";
				} else {
					return "white";
				}
			}
		}
		return h;
	}

	return {
		"author_id_to_hue": author_id_to_hue,
		"author_id_to_color": author_id_to_color
	}
})();
