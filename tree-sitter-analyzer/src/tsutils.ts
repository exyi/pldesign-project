import type * as TreeSitter from "tree-sitter"

export function* ancestors(node: TreeSitter.SyntaxNode, filter: (node: TreeSitter.SyntaxNode) => boolean = () => true) {
	let parent = node.parent
	while (parent) {
		if (filter(parent)) {
			yield parent
		}
		parent = parent.parent
	}
}
