import minimist from 'minimist'
import glob from 'fast-glob'
import { createParser } from './parserFactory'
import { Analyzer, eachNodeTypeQuery, FileResults, nodeTypeQuery } from './analyzer'
import fs from 'node:fs/promises'
import fs_ from 'node:fs'
import _ from 'lodash'
import { Histogram, Metrics, schemeQuery } from './queries/base'
import { pythonAnalyzers } from './queries/python-basic'
import * as bulkanalyzer from './bulkanalyzer'
import * as outputer from './outputFormatter'
import { typescriptAnalyzers } from './queries/typescript-basic'
import { csharpAnalyzers } from './queries/csharp-basic'
import json5 from 'json5'

const args = minimist(process.argv.slice(2))

console.log(args)
const repoCache = args['repo-cache'] ?? '.repo-cache'
const printNormalizedTo: string[] = args['print-normalized-to']?.split(',') ?? ["expressions", "statements", "function_defs"]
const printGroupedBy: string = args['print-grouped-by'] ?? "group"

let analyzeAsync: () => Promise<FileResults[]>
if (args['def']) {
	const definitionFile = args['def']
	const definition: bulkanalyzer.DefinitionFile = json5.parse(fs_.readFileSync(definitionFile, 'utf8'))
	analyzeAsync = async () => {
		return bulkanalyzer.analyzeBulk(definition, { cacheDir: repoCache }) 
	}
} else {
	const language = args.language
	if (language == null) {
	throw new Error('Specify a tree-sitter language with --language')
	}
	const parser = await createParser(language)

	const filesOrDirectories = args._

	const fileFilter = args['filter']


	function wrapArray<T>(a: null|T|T[]): T[] {
	return a == null ? [] : Array.isArray(a) ? a : [a]
	}

	const nodeTypes = wrapArray(args['node-types']).flatMap((s) => s.split(',')).filter((s) => s.length > 0)
	const allNodeTypes = args["node-types"] == true
	const scmQueries =
		Object.entries(args)
			.filter(([key]) => key.startsWith('query-'))
			.map(([key, value]) => schemeQuery(key.slice('query-'.length), value))

	const qFilter =
		args['q'] == null ? /please-dont-occur-in-any-metric-name/ : 
		args['q'] == true ? /./ : new RegExp(args['q'] ?? '')

	const standardQueries = bulkanalyzer.getStandardQueries(language, qFilter)

	const queries = [
		...standardQueries,
		...scmQueries,
		...nodeTypes.map((nodeType) => nodeTypeQuery(nodeType, nodeType)),
		...(allNodeTypes ? [eachNodeTypeQuery] : []),
	]

	if (args["query-file"]) {
		const queryFile = args["query-file"]
		const querySource = fs_.readFileSync(queryFile, 'utf8')
		const query = schemeQuery("q", querySource)
		queries.push(query)
	}

	const analyzer = new Analyzer(parser, queries)
	// const files = glob.sync(files, { unique: true, onlyFiles: true })

	analyzeAsync = async () => {
		if (filesOrDirectories.length === 0) {
			console.warn("no files analyzed")
		}

		for (const fileOrDirectory of filesOrDirectories) {
			console.log(`Analyzing ${fileOrDirectory}`)
			await bulkanalyzer.analyzeDirOrRepo(analyzer, fileOrDirectory, { include: new RegExp(fileFilter ?? '.') }, repoCache)
		}
		return analyzer.results
	}
}

function printResults(totalResults: [string, Metrics][]) {
	const metricNames = _.sortBy(_.uniq(totalResults.flatMap(([_, m]) => Object.keys(m))), (m) => m.toLowerCase())
	const metricLen = _.max(metricNames.map(result => result.length + 1)) ?? 20
	const groupLen = _.max(totalResults.map(([g, _]) => g.length)) ?? 0

	console.log(`${"".padEnd(metricLen + groupLen+ +!!groupLen)} ${"#".padStart(10)} ${printNormalizedTo.map((s) => ("/" + s.slice(0, 15)).padStart(15)).join(" ")}`)

	function printNumericMetric(r: Metrics, m: string, g: string, v: number) {
		const normalizedNumbers = printNormalizedTo.map((s) => r[s] == 0 ? "-" : v / Number(r[s]))
		console.log(`${m.padEnd(metricLen)}${g} ${v?.toLocaleString("sv").padStart(10)} ${normalizedNumbers.map(n => n.toLocaleString("sv", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).replace(",", ".").padStart(15)).join(" ")}`)
	}

	function printHistogramMetric(m: string, g: string, v: Histogram) {
		console.log(`${m.padEnd(metricLen)}${g} ${v.percentile(0.20).toLocaleString("sv").padStart(4)} .. ${v.percentile(0.50).toLocaleString("sv").padStart(4)} .. ${v.percentile(0.80).toLocaleString("sv").padStart(4)}  mean = ${v.avg().toLocaleString("sv", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).padStart(7)}`)
	}

	for (const metric of metricNames) {
		let isFirst = true
		for (const [group, r] of totalResults) {
			const v = r[metric]
			if (v == null) {
				continue
			}

			const g = groupLen == 0 ? "" : " " + group.padEnd(groupLen)
			const m = isFirst ? metric : ""

			if (typeof v === "number") {
				printNumericMetric(r, m, g, v)
			} else if (v instanceof Histogram) {
				// printNumericMetric("∑" + m, v.total())
				printHistogramMetric(m, g, v)
			}

			isFirst = false
		}
	}

}

analyzeAsync().then(async results => {
	printResults(
		Object.entries(_.groupBy(results, r =>
			/group/i.test(printGroupedBy) ? r.fileGroup ?? "" :
			/file/i.test(printGroupedBy) ? r.file ?? "" :
			/lang(uage)?/i.test(printGroupedBy) ? r.language ?? "" :
			/repo(sitory)?|dir(ectory)?/i.test(printGroupedBy) ? r.dir ?? "" : ""
		))
		.map(([group, results]) => [group, outputer.sumMetrics(results.map(r => r.metrics))]))
	const totalResults = outputer.sumMetrics(results.map(r => r.metrics))
	console.log(`Analyzed ${results.length} files with ${Object.keys(totalResults).length} metrics`)

	if (args.out != null) {
		console.log(`Saving results to ${args.out}`)
		const options: outputer.ExportOptions = {}
		const out: string = args.out
		if (out.endsWith(".json")) {
			await outputer.saveOutputJson(out, results, options)
			console.log(`JSON results are in ${out}`)
		} else if (out.endsWith(".csv")) {
			await outputer.saveOutputCsv(out, results, options)
			console.log(`CSV results are in ${out}`)
		}
		else if (!out.includes('.')) {
			await outputer.saveOutputJson(out + ".json", results, options)
			await outputer.saveOutputCsv(out + ".csv", results, options)
			console.log(`JSON and CSV results are in ${out}.json and ${out}.csv`)
		}
		else {
			console.error(`Unknown output format for ${out}`)
		}
	}

}).catch((e) => {
	console.error(e)
})
