import TreeSitter from 'tree-sitter'
import { AnalyzerQuery, copyMetrics, initializeAnalyzerQuery, InitializedAnalyzerQuery, Metrics } from './queries/base'


export function nodeTypeQuery(metricName: string, nodeType: string|string[]): AnalyzerQuery {
	return {
		metrics: [ metricName ],
		matches: (rootNode: TreeSitter.SyntaxNode) => {
			const result = rootNode.descendantsOfType(nodeType)
			return {
				[metricName]: result.length
			}
		}
	}
}

export const eachNodeTypeQuery: AnalyzerQuery = {
	metrics: [ ],
	matches: (rootNode: TreeSitter.SyntaxNode) => {
		const result: { [k: string]: number } = { }

		function matches(node: TreeSitter.SyntaxNode) {
			const type = node.type
			result[type] = (result[type] ?? 0) + 1
			for (let child = node.firstChild; child != null; child = child.nextSibling) {
				matches(child)
			}
		}
		matches(rootNode)

		return result
	}
}

export type FileResults = {
	dir: string
	language: string
	file: string
	fileGroup?: string
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
		const metrics: Metrics = {}
		for (const query of this._queries) {
			const result = query.matches(tree.rootNode, source)
			for (const [key, value] of Object.entries(result)) {
				if (value) {
					if (metrics[key] != null) {
						console.warn(`Duplicate key ${key} in query ${query}`)
					}
					metrics[key] = value
				}
			}
		}
		if (typeof metrics.ERROR == "number" && metrics.ERROR > source.split('\n').length) {
			console.warn(`Suspiciously high number of errors in ${file} (${metrics.ERROR} errors per ${source.split('\n').length} lines)`)
		}
		this.results.push({ file, dir, metrics: metrics, language: this._parser.getLanguage().name })
	}

	get totalResults() {
		let total: Metrics = { }
		for (const file of this.results) {
			copyMetrics(total, file.metrics)
		}
		return total
	}
}
