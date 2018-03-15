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
            files: new Map([
                [
                    'index.js',
                    `
                        const React = require('react');
                        const ReactDOM = require('react-dom');

                        module.exports = { React, ReactDOM };
                    `,
                ],
            ]),
        });
        const { React, ReactDOM } = await runner.run('./index');

        expect(React).to.be.an.object();
        expect(React.createElement).to.be.a.function();
        expect(ReactDOM).to.be.an.object();
        expect(ReactDOM.render).to.be.a.function();
    });

    lab.test('works with custom extensions', async () => {
        const runner = new Runner.Context({
            defaultExtensions: ['.jsx'],
            files: new Map([
                [
                    'index.jsx',
                    `
                        module.exports = 'index.jsx';
                    `,
                ],
            ]),
        });
        const exported = await runner.run('./index');

        expect(exported).to.equal('index.jsx');
    });

    lab.test('supports reloading after an error', async () => {
        const fileGenerations = [
            `module.exports = 0;`,
            `module.exports = require('i-should-not-exist.js');`,
            `module.exports = 2;`,
        ];
        const runner = new Runner.Context({
            files: {
                get: () => fileGenerations[fileGeneration],
                has: filename => filename === 'index.js',
            },
        });

        const system = await runner.getSystemLoader();
        const resolvedPath = await system.resolve('./index.js');

        let fileGeneration = 0;

        expect(await runner.run('./index.js')).to.equal(fileGeneration);
        fileGeneration++;
        system.registry.delete(resolvedPath);

        try {
            await runner.run('./index.js');
        } catch (error) {
            expect(error).to.be.an.error();
        }
        fileGeneration++;
        system.registry.delete(resolvedPath);

        expect(await runner.run('./index.js')).to.equal(fileGeneration);
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
                    files: new Map([
                        [
                            'widget.js',
                            `
                                import React from 'react';

                                export class Widget extends React.Component {
                                    render() {
                                        return <h1>Hello React</h1>;
                                    }
                                };
                            `,
                        ],
                    ]),
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

        lab.test(
            `works for react with the syntax "import React, { Component } from 'react';"`,
            { timeout: 20000 },
            async () => {
                const runner = new Runner.Context({
                    dependencies: {
                        react: '16.x',
                    },
                    files: new Map([
                        [
                            'index.js',
                            `
                                import React, { Component } from 'react';

                                export { Component, React };
                            `,
                        ],
                    ]),
                    preset: 'typescript',
                    presetOptions: {
                        jsx: 'React',
                    },
                    useBrowser: true,
                });
                const { Component, React } = await runner.run('./index');

                expect(React).to.be.an.object();
                expect(React.createElement).to.be.a.function();
                expect(Component).to.equal(React.Component);
            }
        );

        lab.test(
            'works with custom extensions for files not found in the files host',
            async () => {
                const runner = new Runner.Context({
                    defaultExtensions: ['.js', '.jsx', '.ts', '.tsx'],
                    preset: 'typescript',
                });

                // Note: relative paths for cdn-run in node are based on process.cwd()
                expect(
                    (await runner.run('./fixtures/extension-js')).extension
                ).to.equal('js');
                expect(
                    (await runner.run('./fixtures/extension-jsx')).extension
                ).to.equal('jsx');
                expect(
                    (await runner.run('./fixtures/extension-ts')).extension
                ).to.equal('ts');
                expect(
                    (await runner.run('./fixtures/extension-tsx')).extension
                ).to.equal('tsx');
            }
        );
    });
});
