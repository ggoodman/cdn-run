import typescript from 'rollup-plugin-typescript';

import pkg from './package.json';

export default {
    input: 'src/index.ts',
    output: [
        { file: pkg.main, format: 'umd', name: pkg.name, sourcemap: true },
        { file: pkg.module, format: 'es', name: pkg.name, sourcemap: true },
    ],
    plugins: [
        typescript({
            typescript: require('typescript'),
        }),
    ],
};
