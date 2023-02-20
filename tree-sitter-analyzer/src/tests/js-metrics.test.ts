import type * as TreeSitter from "tree-sitter";
import { Analyzer } from "../analyzer";

import { createParser } from "../parserFactory";
import { AnalyzerQuery, Histogram, Metrics } from "../queries/base";

import { typescriptAnalyzers } from "../queries/typescript-basic";

const parser = createParser("typescript");


async function analyze(source: string, queries: AnalyzerQuery | AnalyzerQuery[]): Promise<Metrics> {
	const analyzer = new Analyzer(await parser, Array.isArray(queries) ? queries : [ queries ])
	analyzer.analyzeFile("test", "test.ts", source)
	return analyzer.results[0].metrics
}
function onlyNumbers(m: Metrics) {
	return Object.fromEntries(Object.entries(m).filter(([ k, v ]) => typeof v == "number"))
}


test("class definition", async () => {
	const m = await analyze(`
class Foo {
	public a: number
	a(abc = 12) {
		return x => abc
	}
}`, Object.values(typescriptAnalyzers))

	expect(onlyNumbers(m)).toEqual({
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
const a = (input: number): number => {
	function b(x) {
		return x + 1
	}
	return input.map(b)
}`, Object.values(typescriptAnalyzers))

	expect(onlyNumbers(m)).toEqual({
		statements: 2,
		expressions: 2,
		function_defs: 2,
		invocations: 1,
		nested_functions: 1,
		binary_operators: 1,
		type_annotations: 2,
	})
})

test("chained calls", async () => {
	const m = await analyze(`
a().b.c().d(f(), g(), h(i(j(a.b))))`, Object.values(typescriptAnalyzers))

	expect(onlyNumbers(m)).toEqual({
		statements: 1,
		expressions: 10,
		chained_calls: 2,
		field_accesses: 2,
		invocations: 8,
	})
	const identifiersH = m.identifier_len  as Histogram
	expect(identifiersH.avg()).toEqual(1)
	expect(identifiersH.percentile(0.8)).toEqual(1)
	expect(identifiersH.total()).toEqual(7)
	const h2 = Histogram.add(identifiersH, identifiersH)
	expect(h2.avg()).toEqual(1)
})

test("nested function", async () => {
	const m = await analyze(`
function a() {
	function b() { // counts
	}
}
[].map(a => {
	function* b() { } // counts
	return b
})
function c() {
	return () => 1 // doesn't count
}
function d() {
	const a = () => 100011010 // counts
	return a
}
	
`, Object.values(typescriptAnalyzers))

	expect(m.nested_functions).toEqual(3)
	expect(m.literals).toEqual(1)
})
