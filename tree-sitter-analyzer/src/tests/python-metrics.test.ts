import type * as TreeSitter from "tree-sitter";
import { Analyzer } from "../analyzer";

import { createParser } from "../parserFactory";
import { AnalyzerQuery, Metrics } from "../queries/base";

import { pythonAnalyzers } from "../queries/python-basic";

const parser = createParser("python");


async function analyze(source: string, queries: AnalyzerQuery | AnalyzerQuery[]): Promise<Metrics> {
	const analyzer = new Analyzer(await parser, Array.isArray(queries) ? queries : [ queries ])
	analyzer.analyzeFile("test", "test.py", source)
	return analyzer.results[0].metrics
}


test("class definition", async () => {
	const m = await analyze(`
class Foo:
	a: int
	def a(abc = 12):
		return lambda x: abc`, Object.values(pythonAnalyzers))

	expect(m).toEqual({
		statements: 1,
		expressions: 1,
		class_defs: 1,
		function_defs: 1,
		lambda_functions: 1,
		literals: 1,
		type_annotations: 1,
	})
})

test("function definition", async () => {
	const m = await analyze(`
def a(input: int) -> int:
	def b(x):
		return x + 1
	return map(b, input)`, Object.values(pythonAnalyzers))

	expect(m).toEqual({
		statements: 2,
		expressions: 2,
		function_defs: 2,
		invocations: 1,
		nested_functions: 1,
		binary_operators: 1,
		literals: 1,
		type_annotations: 2,
	})
})

test("chained calls", async () => {
	const m = await analyze(`
a().b.c().d(f(), g(), h(i(j(a.b))))`, Object.values(pythonAnalyzers))

	expect(m).toEqual({
		statements: 1,
		expressions: 10,
		chained_calls: 2,
		field_accesses: 2,
		invocations: 8,
	})
})
