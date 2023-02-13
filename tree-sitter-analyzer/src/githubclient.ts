import fetch from 'node-fetch'
import { ReadableStream } from 'stream/web'
import fsp from 'fs/promises'
import fs from 'fs'
import strp from 'stream/promises'
import tarStream from 'tar-stream'
import gunzip from 'gunzip-maybe'

export function getTarballUrl(url: string): string {
	let m: RegExpMatchArray | null
	if (m = /^https?:\/\/github.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/tree\/(?<ref>.+)/.exec(url)) {
		return `https://api.github.com/repos/${m.groups!.owner}/${m.groups!.repo}/tarball/${m.groups!.ref}}`
	} 
	if (m = /^https?:\/\/github.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+?)(\.git)?\/?$/.exec(url)) {
		return `https://api.github.com/repos/${m.groups!.owner}/${m.groups!.repo}/tarball`
	} else if (m = /^(?<owner>[^\/]+)\/(?<repo>[^\/]+)$/.exec(url)) {
		return `https://api.github.com/repos/${m.groups!.owner}/${m.groups!.repo}/tarball`
	} else if (m = /^https?:\/\/gitlab.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/tree\/(?<ref>.+)/.exec(url)) {
		return `https://gitlab.com/${m.groups!.owner}/${m.groups!.repo}/-/archive/${m.groups!.ref}/${m.groups!.repo}-${m.groups!.ref}.tar.gz`
	} else if (m = /^https?:\/\/gitlab.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)/.exec(url)) {
		return `https://gitlab.com/${m.groups!.owner}/${m.groups!.repo}/-/archive/master/${m.groups!.repo}-master.tar.gz`
	}

	if (url.endsWith('.tar.gz') || url.endsWith('.tgz') || url.endsWith('.tar') || url.endsWith('/tarball')) {
		return url
	}

	throw new Error(`Unknown URL: ${url}`)
}
function loadTar(tarballUrl: string): Promise<NodeJS.ReadableStream> {
	return fetch(tarballUrl).then(res => res.body!)
}

export async function getTarFile(url: string, cacheDir: string) {
	const tarUrl = getTarballUrl(url)
	const filename = encodeURIComponent(tarUrl)
	const path = `${cacheDir}/${filename}`
	if (fs.existsSync(path)) {
		return path
	}

	fs.mkdirSync(cacheDir, { recursive: true })

	console.log(`Downloading ${tarUrl} to ${path}`)
	const tarStream = await loadTar(tarUrl)
	const fileWrite = fs.createWriteStream(path)
	await strp.pipeline(tarStream, fileWrite)
	fileWrite.close()

	return path
}

export type File = {
	name: string
	content: string
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = []
	for await (const chunk of stream) {
		if (typeof chunk === 'string') {
			chunks.push(Buffer.from(chunk))
		} else {
			chunks.push(chunk)
		}
	}
	return Buffer.concat(chunks).toString('utf-8')
}

export function unwrapJupyter(file: File | undefined): File | undefined {
	if (!file) {
		return file
	}
	if (!file.name.endsWith('.ipynb')) {
		return file
	}
	try {
		const json = JSON.parse(file.content)
		const languageInfo = json.metadata.language_info
		let extension:string = languageInfo?.file_extension ?? languageInfo?.name ?? 'py'
		extension = extension.startsWith(".") ? extension : "." + extension

		const cells: any[] = json.cells
		const code = cells
			.filter((cell: any) => cell.cell_type == "code")
			.map((cell: any, ix) =>
				cell.source.map((s: string) => s[0] == '%' ? '#' + s : s).join('')).join('\n\n') + "\n"

		
		return {
			name: file.name + extension,
			content: code
		}
	}
	catch (e) {
		console.error(`Failed to unwrap Jupyter notebook ${file.name}: ${e}`)
		return file
	}
}

export function listFiles<T>(file: string, filter: RegExp, map: (f: File) => T | undefined): Promise<T[]> {
	const tar = tarStream.extract({
	})

	const result: T[] = []

	tar.on('entry', async (header, stream: NodeJS.ReadableStream, next) => {
		if (header.type === 'file' && filter.test(header.name)) {
			streamToString(stream).then(content => {
				const x = map({
					name: header.name,
					content
				})
				if (x) {
					result.push()
				}
				next()
			},
			err => {
				stream.on('end', () => {
					next()
				})
				stream.resume()
			})
		} else {
			stream.on('end', () => {
				next()
			})
			stream.resume()
		}
	})

	return strp.pipeline(
		fs.createReadStream(file),
		gunzip(),
		tar
	).then(() => result)
}
