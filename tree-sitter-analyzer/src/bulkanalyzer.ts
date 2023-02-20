import fs from "fs";
import fsp from "fs/promises";
import { Analyzer, FileResults } from "./analyzer";
import glob from 'fast-glob'
import * as git from './githubclient'
import { createParser } from "./parserFactory";
import pathModule from 'path'
import { pythonAnalyzers } from "./queries/python-basic";
import { csharpAnalyzers } from "./queries/csharp-basic";
import { typescriptAnalyzers } from "./queries/typescript-basic";
import { schemeQuery } from "./queries/base";

export type DefinitionFile = {
	[tag: string]: {
		queryFilter: any;
		repo: string | string[]
		lang: string
		filter: string
		exclude?: string
		queries?: { [metric: string]: string }
		standardQueries?: boolean
	}[]
}

async function analyzeFile(analyzer: Analyzer, dir: string, file: git.File | undefined) {
	file = git.unwrapJupyter(file)
	if (file == undefined) {
		return
	}
	analyzer.analyzeFile(dir, file.name, file.content)
}

async function analyzeFsFile(analyzer: Analyzer, dir: string, path: string) {
	const contents = await fsp.readFile(path, 'utf8')

	const relativePath = path.length > dir.length && path.startsWith(dir) ? path.substring(dir.length) : path
	analyzeFile(analyzer, dir, { name: relativePath, content: contents })
}

export async function analyzeDirOrRepo(analyzer: Analyzer, path: string, fileFilter: { include: RegExp, exclude?: RegExp }, cacheDir: string) {
	if (fs.existsSync(path)) {
		const lstat = await fsp.lstat(path)
		if (lstat.isDirectory()) {
			const files = await glob(path + '/**', { onlyFiles: true })
			for (const file of files) {
				if (fileFilter.include.test("/" + file) && (!fileFilter.exclude || !fileFilter.exclude.test("/" + file))) {
					await analyzeFsFile(analyzer, path, file)
				}
			}
		} else {
			await analyzeFsFile(analyzer, pathModule.dirname(path), path)
		}
	}

	else {
		const repo = await git.getTarFile(path, cacheDir)
		await git.listFiles(repo, fileFilter, f => {
			// console.log(`Analyzing ${f.name}`)
			analyzeFile(analyzer, path, f)
		})
	}
}

export function getStandardQueries(language: string, filter: RegExp | undefined) {
	return Object.entries(
		language == 'python' ? pythonAnalyzers :
		language == 'typescript' || language == 'javascript' || language == 'tsx' ? typescriptAnalyzers :
		language == 'c-sharp' ? csharpAnalyzers :
		{})
		.filter(([name, _]) => !filter || filter.test(name))
		.map(([_, query]) => query)
}

function getExtensionPattern(language: string) {
	return {
		python: /\.py$/i,
		typescript: /\.ts$/i,
		javascript: /\.[mc]?js$/i,
		tsx: /\.tsx$/i,
		"c-sharp": /\.cs$/i,
	}[language]
}

const defaultExclude = new RegExp(`/node_modules/|/dist/|([tT]est?s)/|/docs/`)

export async function analyzeBulk(defs: DefinitionFile, { cacheDir }: { cacheDir: string }) {
	const results: FileResults[] = []
	for (const group in defs) {
		for (const d of defs[group]) {
			try {
				console.log(`Analyzing ${group.padEnd(10)} ${d.repo}`)
				const parser = await createParser(d.lang)
				const queries = Object.entries(d.queries ?? {}).map(([name, query]) => schemeQuery(name, query))
				const stdQueries = d.standardQueries !== false ? getStandardQueries(d.lang, d.queryFilter ? new RegExp(d.queryFilter) : undefined) : []
				const analyzer = new Analyzer(parser, queries.concat(stdQueries))
				const includePattern = d.filter ?? getExtensionPattern(d.lang)

				for (const repo of Array.isArray(d.repo) ? d.repo : [d.repo]) {
					const filter = {
						include: new RegExp(includePattern),
						exclude:
							d.exclude === undefined ? defaultExclude :
							d.exclude === null ? undefined :
							new RegExp(d.exclude)
					}
					await analyzeDirOrRepo(analyzer, repo, filter, cacheDir)
				}

				results.push(...analyzer.results.map(r => ({ ...r, fileGroup: group })))
			} catch (e) {
				console.error(`Error analyzing ${group} ${d.repo}`)
				console.error(e)
			}
		}
	}

	return results
}
