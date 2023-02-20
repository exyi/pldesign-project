import type * as TreeSitter from "tree-sitter";
import { Analyzer } from "../analyzer";

import { createParser } from "../parserFactory";
import { AnalyzerQuery, Metrics } from "../queries/base";

import { csharpAnalyzers } from "../queries/csharp-basic";

const parser = createParser("c-sharp");


async function analyze(source: string, queries: AnalyzerQuery | AnalyzerQuery[]): Promise<Metrics> {
	const analyzer = new Analyzer(await parser, Array.isArray(queries) ? queries : [ queries ])
	analyzer.analyzeFile("test", "test.cs", source)
	return analyzer.results[0].metrics
}

function onlyNumbers(m: Metrics) {
	return Object.fromEntries(Object.entries(m).filter(([ k, v ]) => typeof v == "number"))
}

test("class definition", async () => {
	const m = await analyze(`
class Foo {
	public int a;
	public Func<int, int> a(int abc = 12) {
		return x => abc;
	}
}`, Object.values(csharpAnalyzers))

	expect(onlyNumbers(m)).toEqual({
		statements: 1,
		expressions: 1,
		class_defs: 1,
		function_defs: 1,
		lambda_functions: 1,
		literals: 1,
		type_annotations: 3,
	})
})

test("function definition", async () => {
	const m = await analyze(`
IEnumerable<int> A(IEnumerable<int> input) {
	int b(int x) {
		return x + 1;
	}
	return input.Select(b);
}`, Object.values(csharpAnalyzers))

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
a().b.c().d(f(), g(), h(i(j(a.b))));`, Object.values(csharpAnalyzers))

	expect(onlyNumbers(m)).toEqual({
		statements: 1,
		expressions: 10,
		chained_calls: 2,
		field_accesses: 2,
		invocations: 8,
	})
})
