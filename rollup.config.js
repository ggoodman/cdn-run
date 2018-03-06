import commonjsPlugin from 'rollup-plugin-commonjs';
import nodeResolvePlugin from 'rollup-plugin-node-resolve';
import postprocessPlugin from 'rollup-plugin-postprocess';
import typescript from 'typescript';
import typescriptPlugin from 'rollup-plugin-typescript';
import virtualPlugin from 'rollup-plugin-virtual';

import pkg from './package.json';

export default [
    {
        input: 'src/index.ts',
        output: {
            file: pkg.browser,
            format: 'umd',
            name: pkg.name,
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
            postprocessPlugin([
                [/\(eval\)/, '(0, eval)'],
            ]),
        ],
    },
    {
        input: 'src/index.ts',
        output: {
            file: pkg.main,
            format: 'umd',
            name: pkg.name,
            sourcemap: true,
        },
        plugins: [
            typescriptPlugin({
                target: 'ES2015',
                typescript,
            }),
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
            typescriptPlugin({
                target: 'ES2017',
                typescript,
            }),
        ],
    },
];
