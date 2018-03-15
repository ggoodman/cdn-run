import fetch from 'cross-fetch';
import {
    Client,
    Package,
    NpmPackageVersionResponse,
} from 'resolve-npm-dependency-graph';
import SystemJSLoader from 'systemjs';

import * as TypescriptPreset from './typescript-preset';

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
    defaultExtensions?: Array<string>;
    baseUrl?: string;
    dependencies?: DependencyMap;
    files?: FilesHost;
    preset?: PresetName;
    presetOptions?: { [key: string]: any };
    processEnv?: { [key: string]: string };
    useBrowser?: boolean;
}

export interface FilesHost {
    get: (pathname: string) => string | Promise<string>;
    has: (pathname: string) => boolean | Promise<boolean>;
}

export interface SystemJSModule {
    name: string;
    address: string;
    source?: string;
    metadata?: any;
}

export interface SystemJSPlugin {
    fetch?(
        load: SystemJSModule,
        systemFetch: (load: SystemJSModule) => string | Promise<string>
    ): string | Promise<string>;
    instantiate?(
        load: SystemJSModule,
        systemInstantiate: (load: SystemJSModule) => object | Promise<object>
    ): object | Promise<object>;
    locate?(load: SystemJSModule): string | Promise<string>;
    translate?(load: SystemJSModule): string | Promise<string>;
}

const presets: PresetListing = {
    typescript: TypescriptPreset,
};

export class Context {
    private baseUrl: string;
    private dependencies: { [name: string]: string };
    private files: FilesHost;
    private preset: PresetName;
    private presetOptions: { [key: string]: any };
    private processEnv: { [key: string]: string };
    private resolverClient: Client;
    private systemLoaderPromise?: Promise<SystemJSLoader.System>;
    private useBrowser: boolean;

    protected defaultExtensions: Array<string>;

    constructor({
        defaultExtensions = ['.js'],
        baseUrl = 'https://cdn.jsdelivr.net/npm',
        dependencies = {},
        files = new Map(),
        preset = null,
        presetOptions = {},
        processEnv = { NODE_ENV: 'development' },
        useBrowser = typeof window === 'object',
    }: ContextOptions = {}) {
        this.defaultExtensions = defaultExtensions;
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
        this.systemLoaderPromise = null;
        this.useBrowser = useBrowser;
    }

    private async createSystemLoader(): Promise<SystemJSLoader.System> {
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
                [`${this.baseUrl}/*`]: {
                    globals: {
                        process: '@cdn-run-process',
                    },
                    loader: '@cdn-run-remote',
                },
            },
            packages: {
                '.': {
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
                    this.useBrowser && typeof pkg.raw.browser === 'string'
                        ? pkg.raw.browser
                        : pkg.raw.main || 'index.js',
            };

            if (this.useBrowser && typeof pkg.raw.browser === 'object') {
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

                systemConfig.packages[pkgId].map[childPkg.name] = childPkgId;

                queue.push(childPkg);
            }
        }

        const system = new SystemJSLoader.constructor();

        if (preset) {
            await preset.onBeforeSystemConfig.call(
                this,
                systemConfig,
                this.presetOptions
            );
        }
        const localLoader: SystemJSPlugin = {
            fetch: async (
                load: SystemJSModule,
                systemFetch: (load: SystemJSModule) => Promise<string>
            ): Promise<string> => {
                const extRx = /\.(js|jsx|ts|tsx)$/i;
                const originalPathname =
                    load.name.indexOf(system.baseURL) === 0
                        ? load.name.slice(system.baseURL.length)
                        : load.name;
                const localPathnames = [originalPathname].concat(
                    this.defaultExtensions.map(ext =>
                        originalPathname.replace(extRx, ext)
                    )
                );

                // First try loading from the files host
                for (const pathname of localPathnames) {
                    const exists = await this.files.has(pathname);

                    if (exists) return await this.files.get(pathname);
                }

                // Fall through to default system behaviour
                // with the addition of extensions fallbacks
                const remotePathnames = localPathnames.map(
                    pathname => `${system.baseURL}${pathname}`
                );
                const loadScript = async (
                    pathname: string
                ): Promise<string> => {
                    load.address = pathname;

                    try {
                        return await systemFetch(load);
                    } catch (error) {
                        console.error(error);

                        if (
                            (remotePathnames.length &&
                                error.code === 'ENOENT') ||
                            error.code == 'ENOTFOUND'
                        ) {
                            const nextPathname = remotePathnames.shift();

                            return await loadScript(nextPathname);
                        }

                        throw error;
                    }
                };

                return loadScript(originalPathname);
            },
            locate: async (load: SystemJSModule): Promise<string> => {
                if (!await this.files.has(load.name)) {
                    const baseUrl = system.baseURL;
                    const pathname =
                        load.name.indexOf(baseUrl) === 0
                            ? load.name.slice(baseUrl.length)
                            : load.name;
                    const extRx = /\.(js|jsx|ts|tsx)$/i;

                    for (const extension of this.defaultExtensions) {
                        const sourcePathname = pathname.replace(
                            extRx,
                            extension
                        );

                        if (await this.files.has(sourcePathname)) {
                            return `${baseUrl}${sourcePathname}`;
                        }
                    }
                }

                return load.name;
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

        system.config(systemConfig);
        system.registry.set('@cdn-run-local', system.newModule(localLoader));
        system.registry.set('@cdn-run-process', system.newModule(processEnv));
        system.registry.set('@cdn-run-remote', system.newModule(remoteLoader));
        system.trace = true;

        return system;
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

    async getSystemLoader(): Promise<SystemJSLoader.System> {
        if (!this.systemLoaderPromise) {
            this.systemLoaderPromise = this.createSystemLoader();
        }

        return await this.systemLoaderPromise;
    }

    async run(pathname: string): Promise<any> {
        const system = await this.getSystemLoader();

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
