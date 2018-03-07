import fetch from 'cross-fetch';
import {
    Client,
    Package,
    NpmPackageVersionResponse,
} from 'resolve-npm-dependency-graph';
import SystemJSLoader from 'systemjs';
import { CompilerOptions } from 'typescript';

export type DependencyMap = { [name: string]: string };
export enum PresetName {
    typescript = 'typescript',
}

interface PresetDefinition {
    onBeforeResolveDependencies?: (
        this: Context,
        dependencies: DependencyMap
    ) => DependencyMap | Promise<DependencyMap>;
    onBeforeSystemConfig?: (
        this: Context,
        systemConfig: SystemJSLoader.Config,
        presetOptions?: any
    ) => SystemJSLoader.Config | Promise<SystemJSLoader.Config>;
}

type PresetListing = { [key in PresetName]: PresetDefinition };

export interface ContextOptions {
    baseUrl?: string;
    dependencies?: DependencyMap;
    files?: { [pathname: string]: string };
    preset?: PresetName;
    presetOptions?: { [key: string]: any };
    processEnv?: { [key: string]: string };
    useBrowser?: boolean;
}

export interface SystemJSModule {
    name: string;
    address: string;
    source?: string;
    metadata?: any;
}

export interface SystemJSPlugin {
    fetch?(
        spec: any,
        systemFetch: (spec: any) => Promise<string>
    ): string | Promise<string>;
    instantiate?(
        load: SystemJSModule,
        systemInstantiate: (load: SystemJSModule) => object | Promise<object>
    ): object | Promise<object>;
    translate?(load: SystemJSModule): string | Promise<string>;
}

const presets: PresetListing = {
    typescript: {
        onBeforeResolveDependencies: function(
            this: Context,
            dependencies: DependencyMap
        ): DependencyMap {
            if (!dependencies['plugin-typescript']) {
                dependencies['plugin-typescript'] = '^8.0.0';
            }
            if (!dependencies['typescript']) {
                dependencies['typescript'] = '^2.7.2';
            }

            return dependencies;
        },
        onBeforeSystemConfig: function(
            this: Context,
            systemConfig: SystemJSLoader.Config,
            presetOptions: any = {}
        ): SystemJSLoader.Config {
            const shimModules = [
                'crypto',
                'fs',
                'path',
                'os',
                'source-map-support',
            ];

            if (!systemConfig.map['plugin-typescript'])
                throw new Error('plugin-typescript mapping not found');

            if (!systemConfig.map.typescript)
                throw new Error('typescript mapping not found');

            const pluginTypescriptMapping = <string>systemConfig.map[
                'plugin-typescript'
            ];
            const typescriptMapping = <string>systemConfig.map.typescript;

            if (!systemConfig.packages[pluginTypescriptMapping])
                throw new Error('plugin-typescript package not found');

            if (!systemConfig.packages[typescriptMapping])
                throw new Error('typescript package not found');

            systemConfig.packages[pluginTypescriptMapping].format = <SystemJSLoader.ModuleFormat>'system';
            systemConfig.packages[typescriptMapping].format = 'cjs';

            systemConfig.packages[typescriptMapping].meta = {
                ...(systemConfig.packages[typescriptMapping].meta || {}),
                'lib/typescript.js': {
                    exports: 'ts',
                },
            };

            for (const coreModuleName of shimModules) {
                if (
                    !systemConfig.packages[typescriptMapping].map[
                        coreModuleName
                    ]
                ) {
                    systemConfig.packages[typescriptMapping].map[
                        coreModuleName
                    ] =
                        '@empty';
                }
            }

            systemConfig.transpiler = 'plugin-typescript';
            systemConfig.typescriptOptions = <CompilerOptions>{
                allowJs: true,
                allowSyntheticDefaultImports: true,
                esModuleInterop: true,
                tsconfig: false,
                ...presetOptions,
            };

            return systemConfig;
        },
    },
};

export class Context {
    private baseUrl: string;
    private dependencies: { [name: string]: string };
    private files: { [pathname: string]: string };
    private preset: PresetName;
    private presetOptions: { [key: string]: any };
    private processEnv: { [key: string]: string };
    private resolverClient: Client;
    private systemConfigDfd?: Deferred<SystemJSLoader.Config>;
    private useBrowser: boolean;

    constructor({
        baseUrl = 'https://cdn.jsdelivr.net/npm',
        dependencies = {},
        files = {},
        preset = null,
        presetOptions = {},
        processEnv = { NODE_ENV: 'development' },
        useBrowser = typeof window === 'object',
    }: ContextOptions = {}) {
        this.baseUrl =
            baseUrl.charAt(baseUrl.length - 1) === '/'
                ? baseUrl.slice(0, -1)
                : baseUrl;
        this.dependencies = dependencies;
        this.files = files;
        this.preset = preset;
        this.presetOptions = presetOptions;
        this.processEnv = processEnv;
        this.resolverClient = new Client({
            packageMetadataLoader: spec => this.loadPackageMetadata(spec),
        });
        this.systemConfigDfd = null;
        this.useBrowser = useBrowser;
    }

    private loadDependencyPackages(
        dependencies: DependencyMap
    ): Promise<Array<Package>> {
        return Promise.all(
            Object.keys(dependencies).map(name => {
                const range = dependencies[name];

                return this.resolverClient.load(`${name}@${range}`);
            })
        );
    }

    private async loadPackageMetadata(
        spec: string
    ): Promise<NpmPackageVersionResponse> {
        const res = await fetch(`${this.baseUrl}/${spec}/package.json`, {
            redirect: 'follow',
        });

        if (res.status !== 200) {
            throw new Error(
                `Unexpected status code loading '${spec}': ${res.status}`
            );
        }

        return res.json();
    }

    private normalizeLocalPathname(pathname: string): string {
        return pathname
            .split('/')
            .filter(Boolean)
            .join('/');
    }

    async loadSystemConfig(): Promise<SystemJSLoader.Config> {
        if (!this.systemConfigDfd) {
            this.systemConfigDfd = new Deferred();

            try {
                const preset: PresetDefinition = this.preset
                    ? presets[this.preset]
                    : null;
                let dependencies = Object.assign({}, this.dependencies);
                const systemConfig: SystemJSLoader.Config = {
                    map: {},
                    meta: {
                        '*': <any>{
                            esModule: true,
                            // esmExports: true,
                        },
                    },
                    packages: {
                        '.': {
                            defaultExtension: 'js',
                        },
                    },
                };

                if (preset) {
                    dependencies = await preset.onBeforeResolveDependencies.call(
                        this,
                        dependencies
                    );
                }

                const queue = [];
                const pkgs = await this.loadDependencyPackages(dependencies);
                const seen = new Set();

                for (const pkg of pkgs) {
                    const pkgId = `${this.baseUrl}/${pkg.name}@${pkg.version}`;
                    systemConfig.map[pkg.name] = pkgId;
                    queue.push(pkg);
                }

                while (queue.length) {
                    const pkg = queue.shift();

                    if (seen.has(pkg)) continue;
                    else seen.add(pkg);

                    const pkgId = `${this.baseUrl}/${pkg.name}@${pkg.version}`;

                    systemConfig.packages[pkgId] = {
                        defaultExtension: 'js',
                        map: {},
                        main:
                            this.useBrowser &&
                            typeof pkg.raw.browser === 'string'
                                ? pkg.raw.browser
                                : pkg.raw.main || 'index.js',
                    };

                    if (
                        this.useBrowser &&
                        typeof pkg.raw.browser === 'object'
                    ) {
                        for (const moduleName in pkg.raw.browser) {
                            const remapping = pkg.raw.browser[moduleName];
                            systemConfig.packages[pkgId].map[moduleName] =
                                remapping === false ? '@empty' : remapping;
                        }
                    }

                    for (const childPkg of pkg.children.values()) {
                        const childPkgId = `${this.baseUrl}/${childPkg.name}@${
                            childPkg.version
                        }`;

                        systemConfig.packages[pkgId].map[
                            childPkg.name
                        ] = childPkgId;

                        queue.push(childPkg);
                    }
                }

                return systemConfig;
            } catch (error) {
                this.systemConfigDfd.reject(error);
            }
        }
        return this.systemConfigDfd.promise;
    }

    async run(pathname: string): Promise<any> {
        const baseSystemConfig = await this.loadSystemConfig();

        // Shallow clone should be enough
        let systemConfig: SystemJSLoader.Config = {
            ...baseSystemConfig,
            meta: {
                ...baseSystemConfig.meta,
                [`${this.baseUrl}/*`]: {
                    globals: {
                        process: '@cdn-run-process',
                    },
                    loader: '@cdn-run-remote',
                },
            },
            packages: {
                ...baseSystemConfig.packages,
                '.': {
                    ...(baseSystemConfig.packages['.'] || {}),
                    meta: {
                        '*': {
                            loader: '@cdn-run-local',
                            globals: {
                                process: '@cdn-run-process',
                            },
                        },
                    },
                },
            },
        };

        const system = new SystemJSLoader.constructor();
        const virtualFiles: { [pathname: string]: string } = {};

        for (const pathname in this.files) {
            const normalizedPathname = await system.resolve(pathname);
            virtualFiles[normalizedPathname] = this.files[pathname];
        }

        const preset: PresetDefinition = this.preset
            ? presets[this.preset]
            : null;

        if (preset) {
            systemConfig = await preset.onBeforeSystemConfig.call(
                this,
                systemConfig,
                this.presetOptions
            );
        }

        const localLoader: SystemJSPlugin = {
            fetch: (
                spec: any,
                systemFetch: (url: string) => Promise<string>
            ): string | Promise<string> => {
                const contents = virtualFiles[spec.address];

                if (typeof contents === 'string') {
                    return contents;
                }

                // Fall through to default system behaviour
                return systemFetch(spec);
            },
        };
        const processEnv = { env: this.processEnv };
        const remoteLoader: SystemJSPlugin = {
            fetch: (spec: any): Promise<string> =>
                new Promise((resolve, reject) => {
                    let done = false;
                    const timeout = setTimeout(() => {
                        done = true;

                        return reject(
                            new Error(
                                `Timed out while requesting: ${spec.address}`
                            )
                        );
                    }, 5000);

                    return fetch(spec.address, { redirect: 'follow' }).then(
                        res => {
                            if (done) return;

                            clearTimeout(timeout);

                            if (res.status !== 200)
                                throw new Error(
                                    `Unexpected status code fetching ${
                                        spec.address
                                    }: ${res.status}`
                                );

                            return resolve(res.text());
                        }
                    );
                }),
        };

        if (this.preset === PresetName.typescript) {
            // const typescriptContext = new Context({
            //     dependencies: {
            //         'plugin-typescript': '^8.0.0',
            //         typescript: '^2.7.2',
            //     },
            // });
            // const TypescriptPlugin = await typescriptContext.run(
            //     'plugin-typescript'
            // );
            // const localLoaderFetch = localLoader.fetch.bind(localLoader);
            // localLoader.fetch = async (spec) => {
            //     const source = await localLoaderFetch(spec);
            //     const load: SystemJSModule = {
            //         name: spec.name,
            //         address: spec.address,
            //         metadata: {},
            //         source,
            //     };
            //     return await TypescriptPlugin.translate(load);
            // };
            // localLoader.instantiate = (load, systemInstantiate) => {
            //     return TypescriptPlugin.instantiate(load, systemInstantiate);
            // };
            // localLoader.translate = load => {
            //     return TypescriptPlugin.translate(load);
            // };
            // systemConfig.transpiler = this.preset;
        }

        system.config(systemConfig);
        system.registry.set('@cdn-run-local', system.newModule(localLoader));
        system.registry.set('@cdn-run-process', system.newModule(processEnv));
        system.registry.set('@cdn-run-remote', system.newModule(remoteLoader));

        // const normalizedPathname = `./${this.normalizeLocalPathname(pathname)}`;

        return await system.import(pathname);
    }
}

class Deferred<T> {
    promise: Promise<T>;
    resolve: (result: T) => any;
    reject: (error: Error) => any;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
