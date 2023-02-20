import type * as TreeSitter from "tree-sitter"

import { AnalyzerQuery, Histogram, initializeAnalyzerQuery, InitializedAnalyzerQuery, Metrics, schemeQueryHistogram } from "./base"

export function filterLiteralMatches(m: TreeSitter.QueryMatch) {
	const text = m.captures[0].text?.toLowerCase() ?? m.captures[0].node.text?.toLowerCase()
	if (text && [ "true", "false", "null", "1", "0", ".0", "0.0", "0x0", "''", '""', "``", "" ].includes(text))
		return false
	return true
}

export function textLengthQuery(name: string, scm: string) {
	return schemeQueryHistogram(name, scm, (m: TreeSitter.QueryMatch) => m.captures[0].node.text.length)
}

export function subexprCountQuery(name: string, scm: string, subqueryUninitialized: AnalyzerQuery): AnalyzerQuery {
	return (language: any): InitializedAnalyzerQuery => {
		const subquery = initializeAnalyzerQuery(subqueryUninitialized, language)

		const superquery = initializeAnalyzerQuery(schemeQueryHistogram(name, scm, (m: TreeSitter.QueryMatch) => {
			const metrics = subquery.matches(m.captures[0].node, "subexpr")
			const keys = Object.keys(metrics)
			if (keys.length == 0) {
				return 0
			}
			console.assert(keys.length == 1, "Too many metrics returned", metrics)
			return metrics[keys[0]] as number
		}), language)

		return superquery;
	}
}
