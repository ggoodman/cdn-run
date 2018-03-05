//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

const Runner = require('../');

const lab = (exports.lab = Lab.script({
    cli: {
        globals: [
            '__extends',
            '__assign',
            '__rest',
            '__decorate',
            '__param',
            '__metadata',
            '__awaiter',
            '__generator',
            '__exportStar',
            '__values',
            '__read',
            '__spread',
            '__await',
            '__asyncGenerator',
            '__asyncDelegator',
            '__asyncValues',
            '__makeTemplateObject',
            '__importStar',
            '__importDefault',
            '__cjsWrapper',
            'define',
            'SystemJS',
            'System',
        ],
    },
}));

lab.describe('runtime', () => {
    lab.test(
        'works for simple packages with useBrowser=false',
        { timeout: 20000 },
        async () => {
            const runner = new Runner.Context({
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
            const { React, ReactDOM } = await runner.run('index');

            expect(React).to.be.an.object();
            expect(React.createElement).to.be.a.function();
            expect(ReactDOM).to.be.an.object();
            expect(ReactDOM.render).to.be.a.function();
        }
    );
});
