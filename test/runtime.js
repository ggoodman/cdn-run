//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

const Runner = require('../');

const lab = (exports.lab = Lab.script({
    cli: {
        globals: [
            '__assign',
            '__asyncDelegator',
            '__asyncGenerator',
            '__asyncValues',
            '__await',
            '__awaiter',
            '__cjsWrapper',
            '__decorate',
            '__exportStar',
            '__extends',
            '__generator',
            '__importDefault',
            '__importStar',
            '__makeTemplateObject',
            '__metadata',
            '__param',
            '__read',
            '__rest',
            '__spread',
            '__values',
            'debugObjectHost',
            'define',
            'System',
            'SystemJS',
            'toolsVersion',
            'ts',
            'tsHost',
            'TypeScript',
        ],
    },
}));

lab.describe('runtime', () => {
    lab.test('works for react and react-dom', { timeout: 20000 }, async () => {
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
        const { React, ReactDOM } = await runner.run('./index');

        expect(React).to.be.an.object();
        expect(React.createElement).to.be.a.function();
        expect(ReactDOM).to.be.an.object();
        expect(ReactDOM.render).to.be.a.function();
    });

    lab.describe('the typescript preset', () => {
        lab.test(
            'allows for a custom react component with jsx',
            { timeout: 200000000 },
            async () => {
                const runner = new Runner.Context({
                    dependencies: {
                        react: '16.x',
                        'react-dom': '16.x',
                    },
                    files: {
                        'widget.js': `
                        import React from 'react';

                        export class Widget extends React.Component {
                            render() {
                                return <h1>Hello React</h1>;
                            }
                        };
                    `,
                    },
                    preset: 'typescript',
                    presetOptions: {
                        jsx: 'React',
                    },
                    useBrowser: true,
                });
                const { Widget } = await runner.run('./widget');

                expect(Widget).to.be.a.function();
                expect(Widget.prototype).to.be.an.object();
                expect(Widget.prototype.constructor).to.be.a.function();
                expect(Widget.prototype.render).to.be.a.function();
            }
        );
    });
});
