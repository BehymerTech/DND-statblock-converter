// Pathfinder 2E export is intentionally not implemented yet.
//
// PF2's math (proficiency ranks tied to level, the three-action economy,
// degrees of success) doesn't map onto any of the conversion guides this
// project ships with — see ADnD-2E-to-5E-conversion-summary.md, which despite
// its old filename is a 2E->5E guide, not PF2. Real PF2 conversion rules are
// a follow-up (tracked in the README), so this throws instead of guessing.

export function toPf2() {
	throw new Error("Pathfinder 2E conversion isn't implemented yet — PF2 rules differ enough (proficiency ranks, three-action economy) that they need dedicated guidance rather than reusing the other exporters' math.");
}
