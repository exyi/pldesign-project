import _ from "lodash";
import TreeSitter, { Query, Tree } from "tree-sitter";

export class Histogram {
	counts: number[]
	constructor(public buckets: number[], counts: number[] | undefined = undefined) {
		if (!counts) {
			counts = new Array(buckets.length)
			counts.fill(0)
		}
		if (buckets.length != counts.length) {
			throw new Error("buckets and counts must be the same length")
		}
		this.counts = counts
	}

	public mutAdd(number: number, one: number = 1, fill = true): void {
		if (this.buckets.length == 0 || number > this.buckets[this.buckets.length - 1]) {
			if (fill) {
				for (let i = this.buckets[this.buckets.length] ?? 0; i <= number; i++) {
					this.buckets.push(i)
					this.counts.push(0)
				}
				this.counts[this.counts.length - 1] += one
			}
		}
		else if (this.buckets[number] == number) {
			this.counts[number] += one
		} else {
			const index = _.sortedIndex(this.buckets, number)
			if (index >= this.counts.length) {
				throw new Error("index out of bounds")
			}
			this.counts[index] += one
		}
	}

	public total(): number {
		return _.sum(this.counts)
	}
	public avg(): number {
		let totalWeight = 0
		let totalNum = 0
		for (let i = 0; i < this.buckets.length; i++) {
			totalWeight += this.buckets[i] * this.counts[i]
			totalNum += this.counts[i]
		}
		return totalWeight / totalNum
	}
	public percentile(percentile: number): number {
		const totalCount = this.total()
		const targetCount = totalCount * percentile
		let count = 0
		for (let i = 0; i < this.buckets.length; i++) {
			count += this.counts[i]
			if (count >= targetCount) {
				return this.buckets[i] // TODO: prometheus-like interpolation?
			}
		}
		return this.buckets[this.buckets.length - 1]
	}

	public toString(): string {
		return "TODO " + this.buckets + " " + this.counts
	}

	public static onehot(number: number, one: number = 1): Histogram {
		return new Histogram([number], [one])
	}
	public static add(a: Histogram, b: Histogram): Histogram {
		let bucketA = 0, bucketB = 0
		const buckets = []
		const counts = []

		while (bucketA < a.buckets.length || bucketB < a.buckets.length) {
			if (a.buckets[bucketA] == b.buckets[bucketB]) {
				const count = (a.counts[bucketA] ?? 0) + (b.counts[bucketB] ?? 0)
				counts.push(count)
				buckets.push(a.buckets[bucketA])
				bucketA++
				bucketB++
			} else if (bucketA < a.buckets.length && a.buckets[bucketA] < b.buckets[bucketB]) {
				counts.push(a.counts[bucketA])
				buckets.push(a.buckets[bucketA])
				bucketA++
			} else {
				counts.push(b.counts[bucketB])
				buckets.push(b.buckets[bucketB])
				bucketB++
			}
		}
		return new Histogram(buckets, counts)
	}

	public static aggregateNumbers(numbers: number[], buckets: number[] | null = null): Histogram {
		numbers.sort((a, b) => a - b)
		buckets ??= _.sortedUniq(numbers)
		const counts = new Array(buckets.length)
		let index = 0
		for (const n of buckets) {
			while (numbers[index] <= n) {
				counts[index]++
				index++
			}
		}
		return new Histogram(buckets, counts)
	}
}

export class Messages {
	constructor(public messages: string[]) { }

	public toString(): string {
		return this.messages.join(";")
	}

	public static add(a: Messages, b: Messages): Messages {
		if (a.messages.length == 0) {
			return b
		}
		if (b.messages.length == 0) {
			return a
		}
		return new Messages([...a.messages, ...b.messages])
	}

	public static empty = new Messages([])
}

export type Metric = number | Histogram | Messages | undefined
export type Metrics = { [k: string]: Metric }

export function addMetrics(a: Metric, b: Metric): Metric {
	if (!a) {
		return b
	}
	if (!b) {
		return a
	}

	if (typeof a == "number" && typeof b == "number") {
		return a + b
	}

	if (a instanceof Histogram && b instanceof Histogram) {
		return Histogram.add(a, b)
	}

	if (a instanceof Messages && b instanceof Messages) {
		return Messages.add(a, b)
	}

	if (a instanceof Histogram && b == 1) {
		return Histogram.add(a, Histogram.onehot(1))
	}

	throw new Error(`Cannot add metrics of different types: ${a} and ${b}`)
}

export function concatMetricName(prefix: string, name: string): string {
	return (
		prefix == "" ? name :
		name == "" || name == "default" ? prefix :
		prefix + "_" + name
	)
}
export function copyMetrics(result: Metrics, metrics: Metrics, prefix = ""): void {
	for (const k in metrics) {
		const mname = concatMetricName(prefix, k)
		result[mname] = addMetrics(result[mname], metrics[k])
	}
}
export function prefixMetrics(prefix: string, metrics: Metrics): Metrics {
	const result: Metrics = {}
	copyMetrics(result, metrics, prefix)
	return result
}

export type InitializedAnalyzerQuery = {
	metrics: string[]
	matches(tree: TreeSitter.Tree, source: string): Metrics
}

export type AnalyzerQuery = ((language: any) => InitializedAnalyzerQuery) | InitializedAnalyzerQuery

export const schemeQuery = (
	name: string,
	scm: string,
	filters: { [k: string]: (m: TreeSitter.QueryMatch) => boolean | Metrics } | ((m: TreeSitter.QueryMatch) => boolean | Metrics) = (a) => true,
	debug = false): AnalyzerQuery =>
	(language: any): InitializedAnalyzerQuery => {

	if (typeof filters == "function") {
		filters = { "": filters }
	}

	let query: TreeSitter.Query
	try {
		query = new TreeSitter.Query(language, scm)
	} catch (e: any) {
		const position = e.message?.match(/at position (\d+)/)?.[1]
		if (position) {
			const line = scm.slice(0, Number(position)).split("\n").length
			const char = scm.slice(0, Number(position)).split("\n").pop()!.length
			console.error([
				`Error parsing query at line ${line}, position ${char}:`,
				scm.split("\n").slice(0, line).join("\n"),
				"^".padStart(char, " "),
				scm.split("\n").slice(line).join("\n"),
				"" + e].join("\n"))
		} else {
			console.error("Error parsing query", scm)
			console.error(e)
		}
		throw e
	}
	
	return {
		metrics: [ name ],
		matches: (tree: TreeSitter.Tree, source: string) => {
			const metrics: Metrics = {}
			const matches = query.matches(tree.rootNode)
			for (const m of matches) {
				for (const [fname, filter] of Object.entries(filters)) {
					const metricName = concatMetricName(name, fname)
					const result = filter(m)
					if (result === true) {
						metrics[metricName] = addMetrics(metrics[metricName], 1)
					} else if (result) {
						copyMetrics(metrics, result, metricName)
						if (!result[""]) {
							metrics[metricName] = addMetrics(metrics[metricName], 1)
						}
					} else if (result !== false) {
						throw new Error(`Invalid result from filter ${fname}: ${result}`)
					}

					if (debug) {
						const node = m.captures[0].node
						console.log(`Matched ${metricName} in ${source} at ${node.startPosition.row}:${node.startPosition.column}:`, result)
						console.log(node.text)
					}
				}
			}
			return metrics
		}
	}
}

export function initializeAnalyzerQuery(query: AnalyzerQuery, language: any): InitializedAnalyzerQuery {
	if (typeof query == "function") {
		return query(language)
	}
	return query
}

export function combinedAnalyzer(...queries: AnalyzerQuery[]): AnalyzerQuery {
	if (queries.length == 1)
		return queries[0]

	return (language: any): InitializedAnalyzerQuery => {
		const initializedQueries = queries.map(q => initializeAnalyzerQuery(q, language))
		return {
			metrics: _.uniq(_.flatMap(initializedQueries, q => q.metrics)),
			matches: (tree: TreeSitter.Tree, source: string) => {
				const metrics: Metrics = {}
				for (const q of initializedQueries) {
					copyMetrics(metrics, q.matches(tree, source))
				}
				return metrics
			}
		}
	}
}

export type StandardMetricsAnalyzers = {
	statements: AnalyzerQuery
	conditions: AnalyzerQuery
	loops: AnalyzerQuery
	expressions: AnalyzerQuery
	binary_operators: AnalyzerQuery
	invocations: AnalyzerQuery
	variable_assignments: AnalyzerQuery
	field_assignments: AnalyzerQuery
	field_accesses: AnalyzerQuery
	/** Method call where the target expression contains another method call */
	chained_calls: AnalyzerQuery
	function_defs: AnalyzerQuery
	lambda_functions: AnalyzerQuery
	class_defs: AnalyzerQuery
}
