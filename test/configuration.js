//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

const Runner = require('../');

const lab = (exports.lab = Lab.script());

lab.describe('systemjs configuration', () => {
    lab.test(
        'works for simple packages with useBrowser=false',
        { timeout: 20000 },
        async () => {
            const runner = new Runner.Context({
                dependencies: {
                    react: '16.x',
                    'react-dom': '16.x',
                },
            });
            const systemConfig = await runner.loadSystemConfig();
        }
    );

    lab.test(
        'works for simple packages with useBrowser=true',
        { timeout: 20000 },
        async () => {
            const runner = new Runner.Context({
                dependencies: {
                    react: '16.x',
                    'react-dom': '16.x',
                },
                useBrowser: true,
            });
            const systemConfig = await runner.loadSystemConfig();
        }
    );
});
