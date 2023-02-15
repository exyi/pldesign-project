import { SyntaxNode } from "tree-sitter";
import { combinedAnalyzer, schemeQuery, StandardMetricsAnalyzers } from "./base";
import type * as TreeSitter from "tree-sitter";
import { nodeTypeQuery } from "../analyzer";
import { filterLiteralMatches } from "./queryUtils";

const functionExpressions = ["function", "arrow_function", "generator_function" ]
const functionDefs = ["function_declaration", "generator_function_declaration", "method_definition" ]
function mkQuery(types: string[]) {
	return "[" + types.map(t => "(" + t + ")").join(" ") + "]"
}

export const typescriptAnalyzers = {
	ERROR: nodeTypeQuery("ERROR", "ERROR"),
	statements:
		schemeQuery("statements", `[
			; imports not included on purpose
			(export_statement)
			(expression_statement)
			(if_statement)
			(switch_statement)
			(for_statement)
			(for_in_statement)
			(while_statement)
			(do_statement)
			(try_statement)
			(break_statement)
			(continue_statement)
			(return_statement)
			(throw_statement)
			(lexical_declaration (variable_declarator value: (_ !body)))
			(variable_declaration (variable_declarator value: (_ !body)))
			; class and function definitions not included on purpose
		] @default`, (match) => {
			const node = match.captures[0].node
			// don't count fields as statements
			if (node.parent?.type == "block" && node.parent?.parent?.type == "class_definition") {
				return false
			}
			if (["variable_declaration", "lexical_declaration"].includes(node.type)) {
				const variables = node.children.filter(c => c.type == "variable_declarator")
				if (variables.every((v: any) => v.valueNode && functionExpressions.includes(v.valueNode.type))) {
					return false
				}
			}
			return true
		}),
	conditions: schemeQuery("conditions", `
		[ (if_statement) (ternary_expression) (switch_case) ] @default
		(subscript_expression object: (array (_) @default))
		(subscript_expression object: (object (pair) @default))
	`),
	loops: schemeQuery("loops", `[
		(while_statement)
		(do_statement)
		(for_statement)
		(for_in_statement)
	] @default`),
	expressions: combinedAnalyzer(
		schemeQuery("expressions", `[
				(binary_expression)
				(unary_expression)
				(ternary_expression)
				(assignment_expression)
				(augmented_assignment_expression) ; i += 1
				(update_expression) ; i++
				(call_expression)
				(new_expression)
				(member_expression)
				(await_expression)
				(function)
				(arrow_function)
				(subscript_expression)
				(array)
				(array_pattern)
				(object)
				(object_pattern)
				(spread_element)
				(rest_pattern)
				(yield_expression)
				; actually, let's count it as statement (sequence_expression)
			] @default
			
			(template_string (template_substitution) @default)
			`, (match) => {
			const node = match.captures[0].node
			// don't count a.m() as 2 expressions
			if (node.type == "member_expression" && node.parent?.type == "call_expression" && node == (node.parent as any).functionNode) {
				return false
			}
			// don't count const a = function() { }, it's function definition
			if (functionExpressions.includes(node.type) && ["variable_declarator"].includes(node.parent?.type!)) {
				return false
			}
			return true
		}),
	),
	binary_operators:
		schemeQuery("binary_operators", "(binary_expression) @default"),
	invocations:
		schemeQuery("invocations", "[ (call_expression) (new_expression) ] @default"),
	variable_assignments:
		schemeQuery("variable_assignments", `[
			(assignment_expression left: (identifier) right: (_))
			(variable_declarator)
		] @default`, (match) => {
			const node = match.captures[0].node
			// don't count function definitions as assignments
			if (node.type == "variable_declarator" && (node as any).valueNode && functionExpressions.includes((node as any).valueNode.type)) {
				return false
			}
			return true
		}),
	field_assignments:
		schemeQuery("field_assignments", `(assignment_expression left: (member_expression)) @default`),
	field_accesses:
		schemeQuery("field_accesses", "(member_expression) @default", (match) => {
			const node = match.captures[0].node
			// don't count .method() as field access
			if (node.parent?.type == "call_expression" && node == (node.parent as any).functionNode) {
				return false
			}
			return true
		}),
	chained_calls:
		schemeQuery("chained_calls", `[(call_expression) (new_expression)] @default`, (match) => {
			const node = match.captures[0].node
			let ancestor = node.parent
			while (ancestor) {
				if (ancestor.type == "call_expression") {
					const target: TreeSitter.SyntaxNode = (ancestor as any).functionNode
					return target && (target.endIndex > node.startIndex && target.startIndex < node.endIndex)
				}
				ancestor = ancestor.parent
			}
			return false
		}),
	class_defs:
		schemeQuery("class_defs", "[(class_declaration) (class)] @default"),
	function_defs:
		schemeQuery("function_defs", `
			(method_definition) @default
			(function_declaration) @default
			(generator_function_declaration) @default
			(variable_declarator value: ${mkQuery(functionExpressions)} @default)
		`),
	lambda_functions:
		schemeQuery("lambda_functions", `${mkQuery(functionExpressions)} @default`, (match) => {
			const node = match.captures[0].node
			if (node.parent?.type == "variable_declarator") {
				// function assigned immediately to variable does not count
				return false;
			}
			return true
		}),
	nested_functions:
		schemeQuery("nested_functions", `
			(function_declaration) @default
			(generator_function_declaration) @default
			(variable_declarator value: ${mkQuery(functionExpressions)} @default)
		`, (match) => {
			const node = match.captures[0].node
			let ancestor = node.parent
			while (ancestor) {
				if (["function_declaration", "generator_function_declaration", "function", "generator_function", "arrow_function", "method_definition"].includes(ancestor.type)) {
					return true
				}
				ancestor = ancestor.parent
			}
			return false
		}),

	decorators:
		schemeQuery("decorators", "(decorator) @default"),
	try_catches: // don't care about finally, that's not exception handling
		schemeQuery("try_catches", "(catch_clause) @default"),
	literals:
		schemeQuery("literals", `[
			(number)
			(string)
			(regex)
		] @default`, filterLiteralMatches),
	indexing:
		schemeQuery("indexing", "(subscript_expression) @default"),
	// slicing:
	// 	schemeQuery("slicing", "(slice) @default"),
	type_annotations:
		schemeQuery("type_annotations", `(type_annotation) @default`),
}
