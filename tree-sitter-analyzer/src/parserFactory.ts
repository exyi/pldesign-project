import TreeSitter from "tree-sitter"

export async function createParser(language: string): Promise<TreeSitter> {
	const parser = new TreeSitter()
	const langModule = await import(`tree-sitter-${language}`)
	// console.log(langModule)
	parser.setLanguage(langModule.default)
	return parser
}
