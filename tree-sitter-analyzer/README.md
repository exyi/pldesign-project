# Quantitative code analyzer

This essentially counts the number of [tree-sitter patterns](https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax) occurring in the code in question.

## Setup

```
yarn install
yarn build
```

Optionally `yarn test`

## Usage

The CLI can be executed by running the `./dist/main.js ...arguments` script or by running `yarn launch ...arguments` which also builds it before running.

Basic example. `REPOSITORY` is either a link to github/gitlab repository or a local directory. Filter is a regex, the files matching the regex will be parsed.

```
./dist/main.js --language python --filter '\.(ipynb|py)$' -q --out results REPOSITORY
```


Options:

* `--language LANG` - tree sitter language name
* `-q` - my predefined queries will be used. Specifying value `-q something` will only select metrics matching regex `something`
* `--filter REGEX` - regex selecting files for parsing
* `--out ./file.csv` - JSON or CSV to store the results to
* `--node-types identifier,string,attribute` - measure number of occurrences of the specified syntax nodes. If `--node-types` is used without value, all nodes are counted.
* `--query-file ./file.scm` - load tree sitter query from a file. Capture group names will be become the metric names.
* `--query-x '(identifier) @default'` - number of occurrences of this tree-sitter query will be counted, metric name is `x`
* `--print-normalized-to expressions,statements,function_defs` print stats normalized to any metric. By default its expressions, statements and function_defs


## Example output

```
Analyzing https://github.com/plotly/dash
Analyzed 269 files with 21 queries -> 20 metrics
                              #    /expressions     /statements  /function_defs
binary_operators            639           1.8 %           5.1 %          32.6 %
chained_calls             1 469           4.2 %          11.6 %          74.9 %
class_defs                  106           0.3 %           0.8 %           5.4 %
conditions                1 262           3.6 %          10.0 %          64.4 %
decorators                  804           2.3 %           6.4 %          41.0 %
expressions              34 636         100.0 %         273.9 %       1 767.1 %
field_accesses            3 841          11.1 %          30.4 %         196.0 %
field_assignments           711           2.1 %           5.6 %          36.3 %
function_defs             1 960           5.7 %          15.5 %         100.0 %
indexing                  1 268           3.7 %          10.0 %          64.7 %
invocations              16 492          47.6 %         130.4 %         841.4 %
lambda_functions            232           0.7 %           1.8 %          11.8 %
literals                 22 443          64.8 %         177.5 %       1 145.1 %
loops                       709           2.0 %           5.6 %          36.2 %
nested_functions            518           1.5 %           4.1 %          26.4 %
slicing                      57           0.2 %           0.5 %           2.9 %
statements               12 646          36.5 %         100.0 %         645.2 %
try_catches                  65           0.2 %           0.5 %           3.3 %
type_annotations             11           0.0 %           0.1 %           0.6 %
variable_assignments      2 893           8.4 %          22.9 %         147.6 %
```
