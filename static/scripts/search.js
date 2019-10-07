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
this.tivua.search = (function (window) {
	/**
	 * Implementation of the levenshteinDistance, MIT licensed by
	 * Oleksii Trekhleb. This function is used to determine the quality of a
	 * match.
	 *
	 * See
	 * https://github.com/trekhleb/javascript-algorithms/tree/master/src/algorithms/string/levenshtein-distance
	 * for more information
	 *
	 * @param {string} a
	 * @param {string} b
	 * @return {number}
	 */
	export default function levenshteinDistance(a, b) {
		// Create empty edit distance matrix for all possible modifications of
		// substrings of a to substrings of b.
		const distanceMatrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

		// Fill the first row of the matrix.
		// If this is first row then we're transforming empty string to a.
		// In this case the number of transformations equals to size of a substring.
		for (let i = 0; i <= a.length; i += 1) {
			distanceMatrix[0][i] = i;
		}

		// Fill the first column of the matrix.
		// If this is first column then we're transforming empty string to b.
		// In this case the number of transformations equals to size of b substring.
		for (let j = 0; j <= b.length; j += 1) {
			distanceMatrix[j][0] = j;
		}

		for (let j = 1; j <= b.length; j += 1) {
			for (let i = 1; i <= a.length; i += 1) {
				const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
				distanceMatrix[j][i] = Math.min(
					distanceMatrix[j][i - 1] + 1, // deletion
					distanceMatrix[j - 1][i] + 1, // insertion
					distanceMatrix[j - 1][i - 1] + indicator, // substitution
				);
			}
		}

		return distanceMatrix[b.length][a.length];
	}

	class Index {
		/**
		 * data_array is a reference at an ArrayBuffer instance. This array
		 * contains a binary encoding of the search index. In particular, the
		 * search index is an array of 32 bit integers. The data layout is the
		 * following:
		 *
		 * HEADER
		 * 0: version      monotonously incrementing version number
		 * 1: n_gram_count number of n-grams stored in the index
		 * 2: n_word_count number of words stored in the word index
		 * 3: n_occurences number of occurences stored in the index
		 * 4: n_str_tbl    size of the string table in bytes
		 *
		 * N-GRAM TABLE:
		 * 5 * i + 1
		 */
		constructor(data_array) {
		
		}
	};

	return search;
})(this);

