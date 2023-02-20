import TreeSitter from "tree-sitter"

export async function createParser(language: string): Promise<TreeSitter> {
	const parser = new TreeSitter()
	const langModule =
		language == "tsx" ? (await import(`tree-sitter-${"typescript"}`)).tsx :
		await import(`tree-sitter-${language}`)
	const lang =
		langModule.default && langModule.default.nodeTypeInfo ? langModule.default :
		langModule.nodeTypeInfo ? langModule :
		langModule.default && langModule.default[language] ? langModule.default[language] :
		langModule[language] ? langModule[language] :
		langModule
	try {
		parser.setLanguage(lang)
	} catch (e) {
		console.error(e, lang)
		throw new Error(`Could not load language ${language}`)
	}
	return parser
}
