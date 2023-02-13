# Quantitative coding style analysis

Work in progress project attempting to formalize what are the differences between various coding styles.

For example, taking the number of binary expressions and attribute (field) access expressions, there seems to be a clear difference between "data science Python" and "web Python".
The following chart compares number of ~random github projects I found in the explore sections

![Collection of github projects analyzed](./binary-vs-field-scatter-labels.png)


Similarly, performing PCA analysis on 18 different metrics naturally splits the projects between what I classified as web or data science.

![PCA of the same projects](./pca-split-labels.png)


The metrics are calculated using custom queries on tree-sitter trees.
The software for analysis is in the [tree-sitter-analyzer](./tree-sitter-analyzer/) folder.
