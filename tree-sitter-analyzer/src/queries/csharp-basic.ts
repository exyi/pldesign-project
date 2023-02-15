import { SyntaxNode } from "tree-sitter";
import { combinedAnalyzer, schemeQuery, StandardMetricsAnalyzers } from "./base";
import type * as TreeSitter from "tree-sitter";
import { nodeTypeQuery } from "../analyzer";
import { filterLiteralMatches } from "./queryUtils";

const functionExpressions = [ "anonymous_method_expression", "lambda_expression" ]
function mkQuery(types: string[]) {
	return "[" + types.map(t => "(" + t + ")").join(" ") + "]"
}

export const csharpAnalyzers = {
	ERROR: nodeTypeQuery("ERROR", "ERROR"),
	statements:
		schemeQuery("statements", `[
			; imports not included on purpose
			(expression_statement)
			(if_statement)
			(switch_statement)
			(while_statement)
			(do_statement)
			(for_statement)
			(for_each_statement)
			(yield_statement)
			(try_statement)
			(using_statement)
			(lock_statement)
			(fixed_statement)
			(break_statement)
			(continue_statement)
			(goto_statement)
			(return_statement)
			(throw_statement)
			(local_declaration_statement)
			; class and function definitions not included on purpose
		] @default`, (match) => {
			const node = match.captures[0].node
			return true
		}),
	conditions: schemeQuery("conditions", `
		[ (if_statement)
			(conditional_expression)
			(switch_section (case_switch_label))
			(switch_expression_arm)
			(catch_filter_clause)
		] @default
	`),
	loops: schemeQuery("loops", `[
		(while_statement)
		(do_statement)
		(for_statement)
		(for_each_statement)
	] @default`),
	expressions: combinedAnalyzer(
		schemeQuery("expressions", `[
				(binary_expression)
				(prefix_unary_expression)
				(postfix_unary_expression)
				(conditional_expression)
				(switch_expression)
				(throw_expression)
				(tuple_expression)
				(assignment_expression)
				(invocation_expression)
				(member_access_expression)
				(conditional_access_expression)
				(await_expression)
				(anonymous_method_expression)
				(lambda_expression)
				(element_access_expression)
				(object_creation_expression)
				(implicit_object_creation_expression)
				(array_creation_expression)
				(implicit_array_creation_expression)
				(implicit_stack_alloc_array_creation_expression)
				(stack_alloc_array_creation_expression)
				(anonymous_object_creation_expression)
				(with_expression)
				(ref_expression)
				(range_expression)

				(from_clause) ; technically not expression, but makes sense to count them as such, they would be in a reasonable language :D
				(let_clause)
				(order_by_clause)
				(join_into_clause)
				(join_clause)
				(where_clause)
				(group_clause)
				(query_continuation)

				; patterns are also not expression, but are used similarly
				(or_pattern)
				(and_pattern)
				(subpattern)

				(is_pattern_expression)
				(is_expression)

				(make_ref_expression)
				(ref_type_expression)
				(ref_value_expression)
				
				(interpolation)
			] @default
			`, (match) => {
			const node = match.captures[0].node
			// don't count a.m() as 2 expressions
			if (["member_access_expression", "conditional_access_expression"].includes(node.type) && node.parent?.type == "invocation_expression" && node == (node.parent as any).functionNode) {
				return false
			}
			return true
		}),
	),
	binary_operators:
		schemeQuery("binary_operators", "(binary_expression) @default"),
	invocations:
		schemeQuery("invocations", "[ (invocation_expression) (object_creation_expression) (implicit_object_creation_expression) ] @default"),
	variable_assignments:
		schemeQuery("variable_assignments", `[
			(assignment_expression left: (identifier) right: (_))
			(variable_declarator (equals_value_clause))
			(declaration_pattern)
		] @default`, (match) => {
			const node = match.captures[0].node
			// don't count function definitions as assignments
			if (node.type == "variable_declarator" && (node as any).valueNode && functionExpressions.includes((node as any).valueNode.type)) {
				return false
			}
			return true
		}),
	field_assignments:
		schemeQuery("field_assignments", `
			(assignment_expression left: [(member_access_expression) (conditional_access_expression)]) @default
			(initializer_expression (assignment_expression left: [ (identifier) (member_access_expression) ] @default))
		`),
	field_accesses:
		schemeQuery("field_accesses", "[(member_access_expression) (conditional_access_expression)] @default", (match) => {
			const node = match.captures[0].node
			// don't count .method() as field access
			if (node.parent?.type == "invocation_expression" && node == (node.parent as any).functionNode) {
				return false
			}
			return true
		}),
	chained_calls:
		schemeQuery("chained_calls", `[(invocation_expression) (object_creation_expression)] @default`, (match) => {
			const node = match.captures[0].node
			let ancestor = node.parent
			while (ancestor) {
				if (ancestor.type == "invocation_expression") {
					const target: TreeSitter.SyntaxNode = (ancestor as any).functionNode
					return target && (target.endIndex > node.startIndex && target.startIndex < node.endIndex)
				}
				ancestor = ancestor.parent
			}
			return false
		}),
	class_defs:
		schemeQuery("class_defs", "[(class_declaration) (record_declaration) (struct_declaration) (record_struct_declaration)] @default"),
	function_defs:
		schemeQuery("function_defs", `
			(local_function_statement) @default
			(constructor_declaration) @default
			(method_declaration) @default
			(operator_declaration) @default
			(conversion_operator_declaration) @default
			(destructor_declaration) @default
			(accessor_declaration body: (_) @default)
			(property_declaration value: (arrow_expression_clause)) @default
			(indexer_declaration value: (arrow_expression_clause)) @default
		`),
	lambda_functions:
		schemeQuery("lambda_functions", `${mkQuery(functionExpressions)} @default`, (match) => {
			const node = match.captures[0].node;
			return true
		}),
	nested_functions:
		schemeQuery("nested_functions", `
			(local_function_statement) @default
		`, match => {
			const node = match.captures[0].node
			return node.parent?.type != "global_statement"
		}),

	decorators:
		schemeQuery("decorators", "(attribute) @default"),
	try_catches: // don't care about finally, that's not exception handling
		schemeQuery("try_catches", "(catch_clause) @default"),
	literals:
		schemeQuery("literals", `[
			(real_literal)
			(integer_literal)
			(character_literal)
			(string_literal)
			(interpolated_string_expression)
			(verbatim_string_literal)
			; (raw_string_literal) TODO not supported ATM?
			(size_of_expression)
			(type_of_expression)
		] @default`, filterLiteralMatches),
	indexing:
		schemeQuery("indexing", "(element_access_expression) @default"),
	slicing:
		schemeQuery("slicing", "(range_expression) @default"),
	type_annotations:
		schemeQuery("type_annotations", `
			(variable_declaration type: (_) @default)
			(parameter type: (_) @default)
			(property_declaration type: (_) @default)
			(event_declaration type: (_) @default)
			(indexer_declaration type: (_) @default)
			(method_declaration type: (_) @default)
			(operator_declaration type: (_) @default)
		`, match => {
			const node = match.captures[0].node
			return node.parent?.type != "implicit_type"
		}),
}
