import { SyntaxNode } from "tree-sitter";
import { combinedAnalyzer, schemeQuery, StandardMetricsAnalyzers } from "./base";
import type * as TreeSitter from "tree-sitter";
import { nodeTypeQuery } from "../analyzer";


export const pythonAnalyzers = {
	ERROR: nodeTypeQuery("ERROR", "ERROR"),
	statements:
		schemeQuery("statements", `[
			; imports not included on purpose
			(print_statement)
			(assert_statement)
			(expression_statement)
			(return_statement)
			(delete_statement)
			(raise_statement)
			(pass_statement)
			(break_statement)
			(continue_statement)
			(if_statement)
			(while_statement)
			(for_statement)
			(try_statement)
			(with_statement)
			(match_statement)
			; class and function definitions not included on purpose
		] @default`, (match) => {
			const node = match.captures[0].node
			// don't count fields as statements
			if (node.parent?.type == "block" && node.parent?.parent?.type == "class_definition") {
				return false
			}
			return true
		}),
	conditions: schemeQuery("conditions", `[
		(if_statement)
		(elif_clause)
		(else_clause)
		(match_statement)
		(case_clause)
		(conditional_expression)
	] @default`),
	loops: schemeQuery("loops", `[
		(while_statement)
		(for_statement)
		(dictionary_comprehension)
		(generator_expression)
		(list_comprehension)
	] @default`),
	expressions: combinedAnalyzer(
		schemeQuery("expressions", `[(binary_operator)
			(unary_operator)
			(assignment)
			(named_expression); := assignment
			(call)
			(attribute) ;field access
			(boolean_operator)
			(not_operator)
			(comparison_operator)
			(await)
			(lambda)
			(conditional_expression)
			(subscript)
			(slice)
			(list)
			(list_comprehension)
			(dictionary)
			(dictionary_comprehension)
			(set)
			(set_comprehension)
			(generator_expression)
			(tuple)
			] @default
			
			(string (interpolation) @default)
			`, (match) => {
			const node = match.captures[0].node
			// don't count fields as expressions
			if (node.parent?.type == "expression_statement" && node.parent?.parent?.type == "block" && node.parent?.parent?.parent?.type == "class_definition") {
				return false
			}
			// don't count a.m() as 2 expressions
			if (node.type == "attribute" && node.parent?.type == "call" && node == (node.parent as any).functionNode) {
				return false
			}
			return true
		}),
	),
	binary_operators:
		schemeQuery("binary_operators", "(binary_operator) @default"),
	invocations:
		schemeQuery("invocations", "(call) @default"),
	variable_assignments:
		schemeQuery("variable_assignments", `[
			(assignment left: (identifier) right: (_))
			(named_expression name: (identifier))
		] @default`, (match) => {
			const node = match.captures[0].node
			// don't count fields as assignments
			if (node.parent?.type == "expression_statement" && node.parent?.parent?.type == "block" && node.parent?.parent?.parent?.type == "class_definition") {
				return false
			}
			return true
		}),
	field_assignments:
		schemeQuery("field_assignments", `(assignment left: (attribute)) @default`),
	field_accesses:
		schemeQuery("field_accesses", "(attribute) @default", (match) => {
			const node = match.captures[0].node
			// don't count .method() as field access
			if (node.parent?.type == "call" && node == (node.parent as any).functionNode) {
				return false
			}
			return true
		}),
	chained_calls:
		schemeQuery("chained_calls", `(call) @default`, (match) => {
			const node = match.captures[0].node
			let ancestor = node.parent
			while (ancestor) {
				if (ancestor.type == "call") {
					const target: TreeSitter.SyntaxNode = (ancestor as any).functionNode
					return target && (target.endIndex > node.startIndex && target.startIndex < node.endIndex)
				}
				ancestor = ancestor.parent
			}
			return false
		}),
	class_defs:
		schemeQuery("class_defs", "(class_definition) @default"),
	function_defs:
		schemeQuery("function_defs", "(function_definition) @default"),
	lambda_functions:
		schemeQuery("lambda_functions", "(lambda) @default"),
	nested_functions:
		schemeQuery("nested_functions", "(function_definition) @default", (match) => {
			const node = match.captures[0].node
			let ancestor = node.parent
			while (ancestor) {
				if (ancestor.type == "function_definition") {
					return true
				}
				ancestor = ancestor.parent
			}
			return false
		}),

	decorators:
		schemeQuery("decorators", "(decorator) @default"),
	try_catches: // don't care about finally, that's not exception handling
		schemeQuery("try_catches", "(except_clause) @default"),
	literals:
		schemeQuery("literals", `[
			(float)
			(integer)
			(string)
		] @default`),
	indexing:
		schemeQuery("indexing", "(subscript) @default"),
	slicing:
		schemeQuery("slicing", "(slice) @default"),
	type_annotations:
		schemeQuery("type_annotations", `[
			(assignment type: (_))
			(typed_parameter)
			(function_definition return_type: (_))
		] @default`),
}
