/**
 * Strings that appear in the Lefff conjugation lexicon (french-verbs-lefff,
 * LGPL-LR data, 6 MB) and nowhere in our own content. They are assembled from
 * pieces so this file does not itself contain them, which lets the scans
 * below look at every tracked file, this one included.
 */
export const LEFFF_MARKERS: string[] = [
  ['"suivre":{"P":', '["suis","suis","suit"'].join(""),
  ['"S":["suive","suives"', ',"suive","suivions"'].join(""),
  ['"abhorrer"', ':{"P":['].join(""),
];

/** Our own lexicon is tiny. A run of this many Lefff-shaped rows is a pasted fragment. */
export const LEFFF_ROW_SHAPE = new RegExp(['"P"', ':\\["'].join(""), "g");
export const LEFFF_ROW_LIMIT = 4;
