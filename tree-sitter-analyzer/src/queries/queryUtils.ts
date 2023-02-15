import type * as TreeSitter from "tree-sitter"

export function filterLiteralMatches(m: TreeSitter.QueryMatch) {
	const text = m.captures[0].text?.toLowerCase() ?? m.captures[0].node.text?.toLowerCase()
	if (text && [ "true", "false", "null", "1", "0", ".0", "0.0", "0x0", "''", '""', "``", "" ].includes(text))
		return false
	return true
}
