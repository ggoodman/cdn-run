# Run custom code in a dynamic environment with access to all* npm modules

> *\* except modules having dependencies on native modules*

`cdn-run` lets you run custom code in an environment where npm dependencies have been resolved and can be injected dynamically. No need for Webpack, Rollup, Parcel or even `npm install`.

## Usage

In the following example, we create a new runtime `Context`, and specify that we want both `react@16` and `react-dom@16` to be available. We also include a local file, `index.js` that relies on both of these npm modules and re-exports them.

```js
const { Context } = require('cdn-run');

const runner = new Context({
    dependencies: {
        react: '16.x',
        'react-dom': '16.x',
    },
    files: {
        'index.js': `
            const React = require('react');
            const ReactDOM = require('react-dom');

            module.exports = { React, ReactDOM };
        `,
    },
});
const { React, ReactDOM } = await runner.run('index.js');
```

## How it works

Under the hood, this tool uses [resolve-npm-dependency-graph](https://www.npmjs.com/package/resolve-npm-dependency-graph) to build the dependency graph based on the required npm modules and then configures [SystemJS](https://www.npmjs.com/package/systemjs) so that this graph is respected and so that the supplied local files can be loaded from memory.

## API

### `Context`

#### `new Context(options)`

Create a new `Context` instance, configured with a set of dependencies and local files. Supports the options:

- `dependencies` - (optional) a mapping of package names to version specs (just like you would put in `package.json`).
- `files` - (optional) a mapping of local filenames to their string contents.

#### `run(pathname)`

Runs a local file where:

- `pathname` - (required) the path to the local file that should be treated as the entrypoint

Returns a `Promise` that resolves to the exports of that local file.
