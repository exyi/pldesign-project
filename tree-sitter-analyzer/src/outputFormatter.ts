import _ from "lodash"
import { FileResults } from "./analyzer"
import { copyMetrics, Histogram, Label, Messages, Metrics } from "./queries/base"
import * as csv from "@fast-csv/format"
import fs from "fs"
import fsp from "fs/promises"
import { stream } from "fast-glob"

export type OutputData = {
	files: FileResults
}

export type ExportOptions = {
	histogramPercentiles?: number[]
	histogramData?: boolean
	messagesData?: boolean
	omitFiles?: boolean
	includeEmptyMetrics?: boolean
}

type MetricType = "total" | "histogram-avg" | "histogram-data" | "message-list" | "label" | { percentile: number }
type MetricsList = [string, { type: MetricType, source: string }][]

function getAllMetrics(files: FileResults[], options: ExportOptions = {}): MetricsList {
	const metrics = new Map<string, { type: MetricType, source: string }>()
	function add(metric: string, type: MetricType, source: string) {
		if (!metrics.has(metric)) {
			metrics.set(metric, { type, source })
		}
	}
	for (const file of files) {
		for (const metric of Object.keys(file.metrics)) {
			const val = file.metrics[metric]
			if (typeof val === "number") {
				add(metric + "_total", "total", metric)
			}
			else if (val instanceof Histogram) {
				add(metric + "_avg", "histogram-avg", metric)
				add(metric + "_total", "total", metric)
				for (const percentile of options.histogramPercentiles ?? []) {
					add(metric + "_p" + percentile, { percentile }, metric)
				}

				if (options.histogramData) {
					add(metric + "_histogram", "histogram-data", metric)
				}
			}
			else if (val instanceof Messages) {
				add(metric + "_total", "total", metric)
				if (options.messagesData) {
					add(metric + "_messages", "message-list", metric)
				}
			} else if (val instanceof Label) {
				add(metric, "label", metric)
			}
		}
	}
	return _.sortBy([...metrics.entries()], ([metric, _]) => metric)
}

function getMetricsObject(metrics: MetricsList, file: Metrics, options: ExportOptions = {}): any {
	const result: {[name: string]: any} = {}

	for (const [name, d] of metrics) {
		const metric = file[d.source]
		if (metric == null && !options.includeEmptyMetrics) {
			continue
		}
		if (d.type == "message-list" && options.messagesData == false) {
			continue
		}
		let value: any

		if (metric == null) {
			value = d.type == "total" ? 0 : null
		}
		else if (d.type === "total") {
			if (typeof metric === "number") {
				value = metric
			} else if (value instanceof Histogram) {
				value = value.total()
			} else if (value instanceof Messages) {
				value = value.messages.length
			}
		} else if (d.type === "histogram-avg") {
			value = (file[d.source] as Histogram).avg()
		} else if (d.type === "histogram-data") {
			value = file[d.source]
		} else if (d.type == "message-list") {
			value = (file[d.source] as Messages).messages
		} else if (d.type == "label") {
			value = (file[d.source] as Label).text
		} else if ("percentile" in d.type) {
			value = (file[d.source] as Histogram).percentile(d.type.percentile)
		}

		result[name] = value
	}

	return result
}

export function sumMetrics(metrics: Iterable<Metrics>) {
	const result: Metrics = {}
	for (const m of metrics) {
		if ("ERROR" in m) {
			const errors = m.ERROR as number
			const statements = (m.statements ?? m.expressions ?? m.lines ?? 1000) as number

			if (errors > statements / 50) {
				// skip files with too many errors
				continue
			}
		}
		copyMetrics(result, m)
	}
	return result
}

function getResultData(data: FileResults[], options: ExportOptions = {}) {
	const allMetrics = getAllMetrics(data, options)

	const dirs = _.sortBy(Object.entries(_.groupBy(data, (file) => file.dir)), 0)
	const allLanguages = _.sortedUniq(_.sortBy(data.map(f => f.language)))

	function totalByLanguages(files: FileResults[]) {
		const result: {[language: string]: Metrics} = {}
		for (const language of allLanguages) {
			const m = files.filter(f => f.language === language).map(f => f.metrics)
			if (m.length > 0) {
				result[language] = getMetricsObject(allMetrics, sumMetrics(m), { ...options, messagesData: false})
			}
		}
		return result
	}

	const dirResults = dirs.map(([dir, files]) => {
		const f = _.sortBy(files, 'file').map(file => {
			return {
				file: file.file,
				fileGroup: file.fileGroup,
				language: file.language,
				metrics: getMetricsObject(allMetrics, file.metrics, options),
			}
		})
		return {
			dir,
			files: f,
			dirTotal: totalByLanguages(files)
		}
	})
	
	return {
		allMetrics,
		dirResults,
		totalResults: totalByLanguages(data),
	}
}

export async function saveOutputJson(file: string, data: FileResults[], options: ExportOptions = {}) {
	const d = getResultData(data, options)

	const json = JSON.stringify({
		files: options.omitFiles ? undefined : d.dirResults.flatMap(d => ({dir: d.dir, ...d.files})),
		dirs: d.dirResults,
		total: d.totalResults,
	}, null, 2)

	await fsp.writeFile(file, json)

	console.log("Saved results to", file)
}

export function saveOutputCsv(file: string, data: FileResults[], options: ExportOptions = {}) {
	const d = getResultData(data, {includeEmptyMetrics: true, ...options})

	const csvStream = csv.format({ })

	const fileStream = fs.createWriteStream(file)
	const promise = new Promise((resolve) => {
		csvStream.pipe(fileStream).on("end", resolve)
	})

	csvStream.write([
		"type", "dir", "file", "lang", "group", ...d.allMetrics.map(([name, _]) => name)
	])

	for (const dir of d.dirResults) {
		for (const file of dir.files) {
			csvStream.write([
				"file", dir.dir, file.file, file.language, file.fileGroup ?? "", ...d.allMetrics.map(([n, _]) => file.metrics[n])
			])
		}
		for (const [lang, metrics] of Object.entries(dir.dirTotal)) {
			const groups = _.uniq(dir.files.filter(f => f.language == lang).map(f => f.fileGroup))
			const group = groups.length == 1 ? groups[0] : groups.length > 1 ? "?" : ""
			csvStream.write([
				"dir-total", dir.dir, "//total", lang, group, ...d.allMetrics.map(([n, _]) => metrics[n])
			])
		}
	}

	for (const [lang, metrics] of Object.entries(d.totalResults)) {
		csvStream.write([
			"total", "//total", "//total", lang, "", ...d.allMetrics.map(([n, _]) => metrics[n])
		])
	}

	csvStream.end()

	return promise
}
