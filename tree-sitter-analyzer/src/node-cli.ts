import minimist from 'minimist'
import glob from 'fast-glob'
import { createParser } from './parserFactory'
import { Analyzer, eachNodeTypeQuery, nodeTypeQuery } from './analyzer'
import fs from 'node:fs/promises'
import fs_ from 'node:fs'
import _ from 'lodash'
import { schemeQuery } from './queries/base'
import { pythonAnalyzers } from './queries/python-basic'
import * as bulkanalyzer from './bulkanalyzer'
import * as outputer from './outputFormatter'

const args = minimist(process.argv.slice(2))

console.log(args)

const language = args.language
if (language == null) {
  throw new Error('Specify a tree-sitter language with --language')
}
const parser = await createParser(language)

const filesOrDirectories = args._

const fileFilter = args['filter']
const repoCache = args['repo-cache'] ?? '.repo-cache'

const printNormalizedTo: string[] = args['print-normalized-to']?.split(',') ?? ["expressions", "statements", "function_defs"]

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

const standardQueries =
	Object.entries(
		language == 'python' ? pythonAnalyzers :
		{})
		.filter(([name, _]) => qFilter.test(name))
		.map(([_, query]) => query)

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

async function analyzeAsync() {
	if (filesOrDirectories.length === 0) {
		console.warn("no files analyzed")
	}

	for (const fileOrDirectory of filesOrDirectories) {
		console.log(`Analyzing ${fileOrDirectory}`)
		await bulkanalyzer.analyzeDirOrRepo(analyzer, fileOrDirectory, new RegExp(fileFilter ?? '.'), repoCache)
	}
	return analyzer.results
}

analyzeAsync().then(async results => {
	const totalResults = outputer.sumMetrics(results.map(r => r.metrics))
	console.log(`Analyzed ${results.length} files with ${queries.length} queries -> ${Object.keys(totalResults).length} metrics`)
	const metricLen = Object.keys(totalResults).reduce((max, result) => Math.max(max, result.length), 20)

	console.log(`${"".padEnd(metricLen)} ${"#".padStart(10)} ${printNormalizedTo.map((s) => ("/" + s.slice(0, 15)).padStart(15)).join(" ")}`)

	function printNumericMetric(m: string, v: number) {
		const normalizedNumbers = printNormalizedTo.map((s) => totalResults[s] == 0 ? "-" : v / Number(totalResults[s]))
		console.log(`${m.padEnd(metricLen)} ${v?.toLocaleString("sv").padStart(10)} ${normalizedNumbers.map(n => n.toLocaleString("sv", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).replace(",", ".").padStart(15)).join(" ")}`)
	}

	for (const [m, v] of _.sortBy(Object.entries(totalResults), ([m, _]) => m.toLowerCase())) {
		if (typeof v === "number") {
			printNumericMetric(m, v)
		}
	}

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
