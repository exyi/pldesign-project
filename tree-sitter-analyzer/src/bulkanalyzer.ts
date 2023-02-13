import fs from "fs";
import fsp from "fs/promises";
import { Analyzer } from "./analyzer";
import glob from 'fast-glob'
import * as git from './githubclient'
import { createParser } from "./parserFactory";
import pathModule from 'path'

export type DefinitionFile = {
	[language: string]: {
		repo: string | string | [ string, string ][]
		filter: string
		queries?: { [metric: string]: string }
		standardQueries?: boolean
	}
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

export async function analyzeDirOrRepo(analyzer: Analyzer, path: string, fileFilter: RegExp, cacheDir: string) {

	if (fs.existsSync(path)) {
		const lstat = await fsp.lstat(path)
		if (lstat.isDirectory()) {
			const files = await glob(path + '/**', { onlyFiles: true })
			for (const file of files) {
				if (fileFilter.test(file)) {
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
			analyzeFile(analyzer, path, f)
		})
	}
}

export async function analyzeBulk(defs: DefinitionFile) {
	for (const language in defs) {
		const d = defs[language]
		const parser = await createParser(language)
		// const analyzer = new Analyzer(language)
		// await analyzeDirOrRepo(analyzer, repo, new RegExp(filter), 'cache')
		// analyzer.save()
	}
}
