import commonjsPlugin from 'rollup-plugin-commonjs';
import nodeResolvePlugin from 'rollup-plugin-node-resolve';
import postprocessPlugin from 'rollup-plugin-postprocess';
import typescript from 'typescript';
import typescriptPlugin from 'rollup-plugin-typescript';
import uppercamelcase from 'uppercamelcase';
import virtualPlugin from 'rollup-plugin-virtual';

import pkg from './package.json';

function escape(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

// There is some default behaviour in es-module-loader that prevents
// syntax like `import React, { Component } from 'react'` from working
// as expected. This is decribed here: https://github.com/systemjs/systemjs/issues/1675#issuecomment-306902839
// The following patches that behaviour in the built assets
const patchRx = new RegExp(
    `if (moduleDefault && moduleDefault.__esModule) {
    for (var p in moduleDefault) {
      if (Object.hasOwnProperty.call(moduleDefault, p))
        moduleObj[p] = moduleDefault[p];
    }
  }`
        .split('\n')
        .map(line => escape(line.trim()))
        .join('\\s*\\n\\s*')
);

const patch = `if (moduleDefault) {
    for (var p in moduleDefault) {
      if (Object.hasOwnProperty.call(moduleDefault, p) && !Object.hasOwnProperty.call(moduleObj, p))
        moduleObj[p] = moduleDefault[p];
      }
    }`;

export default [
    {
        input: 'src/index.ts',
        output: {
            file: pkg.browser,
            format: 'umd',
            name: uppercamelcase(pkg.name),
            sourcemap: true,
        },
        plugins: [
            virtualPlugin({
                'cross-fetch': 'export default fetch',
            }),
            nodeResolvePlugin({
                jsnext: false,
                module: true,
                browser: true,
                extensions: ['.js', '.json'],
                main: true,
            }),
            commonjsPlugin({
                include: 'node_modules/**', // Default: undefined
                ignoreGlobal: true,
            }),
            typescriptPlugin({
                exclude: 'node_modules/**',
                target: 'ES2015',
                typescript,
            }),
            postprocessPlugin([[/\(eval\)/, '(0, eval)'], [patchRx, patch]]),
        ],
    },
    {
        input: 'src/index.ts',
        output: {
            file: pkg.main,
            format: 'umd',
            name: uppercamelcase(pkg.name),
            sourcemap: true,
        },
        plugins: [
            nodeResolvePlugin({
                include: 'node_modules/systemjs/**',
                jsnext: false,
                module: true,
                browser: false,
                extensions: ['.js', '.json'],
                main: true,
            }),
            commonjsPlugin({
                include: 'node_modules/**', // Default: undefined
                ignoreGlobal: true,
                ignore: ['systemjs'],
            }),
            typescriptPlugin({
                target: 'ES2015',
                typescript,
            }),
            postprocessPlugin([[/\(eval\)/, '(0, eval)'], [patchRx, patch]]),
        ],
    },
    {
        input: 'src/index.ts',
        output: {
            file: pkg.module,
            format: 'es',
            name: pkg.name,
            sourcemap: true,
        },
        plugins: [
            nodeResolvePlugin({
                include: 'node_modules/systemjs/**',
                jsnext: false,
                module: true,
                browser: false,
                extensions: ['.js', '.json'],
                main: true,
            }),
            commonjsPlugin({
                include: 'node_modules/**', // Default: undefined
                ignoreGlobal: true,
                ignore: ['systemjs'],
            }),
            typescriptPlugin({
                target: 'ES2017',
                typescript,
            }),
            postprocessPlugin([[/\(eval\)/, '(0, eval)'], [patchRx, patch]]),
        ],
    },
];
