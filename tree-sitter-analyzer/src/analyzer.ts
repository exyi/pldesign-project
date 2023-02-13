import TreeSitter from 'tree-sitter'
import { AnalyzerQuery, copyMetrics, initializeAnalyzerQuery, InitializedAnalyzerQuery, Metrics } from './queries/base'


export function nodeTypeQuery(metricName: string, nodeType: string|string[]): AnalyzerQuery {
	return {
		metrics: [ metricName ],
		matches: (tree: TreeSitter.Tree) => {
			const result = tree.rootNode.descendantsOfType(nodeType)
			return {
				[metricName]: result.length
			}
		}
	}
}

export const eachNodeTypeQuery: AnalyzerQuery = {
	metrics: [ ],
	matches: (tree: TreeSitter.Tree) => {
		const result: { [k: string]: number } = { }

		function matches(node: TreeSitter.SyntaxNode) {
			const type = node.type
			result[type] = (result[type] ?? 0) + 1
			for (let child = node.firstChild; child != null; child = child.nextSibling) {
				matches(child)
			}
		}
		matches(tree.rootNode)

		return result
	}
}

export type FileResults = {
	dir: string
	language: string
	file: string
	metrics: Metrics
}

export class Analyzer {
	results: FileResults[] = []
	private _queries: InitializedAnalyzerQuery[]
	constructor(private _parser: TreeSitter, queries: AnalyzerQuery[]) {

		this._queries = queries.map(query =>
			initializeAnalyzerQuery(query, _parser.getLanguage()))
	}

	analyzeFile(dir: string, file: string, source: string) {
		const tree = this._parser.parse(source)

		this.analyzeTree(tree, source, dir, file)
	}

	async analyzeFileAsync(dir: string, file: string, buffer: TreeSitter.TextBuffer) {
		const tree = await this._parser.parseTextBuffer(buffer)

		this.analyzeTree(tree, buffer.toString(), dir, file)
	}


	private analyzeTree(tree: TreeSitter.Tree, source: string, dir: string, file: string) {
		const matches: Metrics = {}
		for (const query of this._queries) {
			const result = query.matches(tree, source)
			for (const [key, value] of Object.entries(result)) {
				if (value) {
					if (matches[key] != null) {
						console.warn(`Duplicate key ${key} in query ${query}`)
					}
					matches[key] = value
				}
			}
		}
		this.results.push({ file, dir, metrics: matches, language: this._parser.getLanguage().name })
	}

	get totalResults() {
		let total: Metrics = { }
		for (const file of this.results) {
			copyMetrics(total, file.metrics)
		}
		return total
	}
}
