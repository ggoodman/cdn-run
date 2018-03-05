import fetch from 'cross-fetch';
import { Client, Package } from 'resolve-npm-dependency-graph';
import { createLoader } from 'resolve-npm-dependency-graph/dist/cdnLoader';
import SystemJSLoader from 'systemjs';

export interface ContextOptions {
    baseUrl?: string;
    dependencies?: { [name: string]: string };
    files?: { [pathname: string]: string };
    useBrowser?: boolean;
}

export class Context {
    private baseUrl: string;
    private dependencies: { [name: string]: string };
    private files: { [pathname: string]: string };
    private resolverClient: Client;
    private systemConfigDfd?: Deferred<SystemJSLoader.Config>;
    private useBrowser: boolean;

    constructor({
        baseUrl = 'https://cdn.jsdelivr.net/npm',
        dependencies = {},
        files = {},
        useBrowser = typeof window === 'object',
    }: ContextOptions = {}) {
        this.baseUrl =
            baseUrl.charAt(baseUrl.length - 1) === '/'
                ? baseUrl.slice(0, -1)
                : baseUrl;
        this.dependencies = dependencies;
        this.files = files;
        this.resolverClient = new Client({
            packageMetadataLoader: createLoader(),
        });
        this.systemConfigDfd = null;
        this.useBrowser = useBrowser;
    }

    private loadDependencyPackages(): Promise<Array<Package>> {
        return Promise.all(
            Object.keys(this.dependencies).map(name => {
                const range = this.dependencies[name];

                return this.resolverClient.load(`${name}@${range}`);
            })
        );
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
                const systemConfig: SystemJSLoader.Config = {
                    map: {},
                    meta: {},
                    packages: {},
                };
                const queue = [];
                const pkgs = await this.loadDependencyPackages();
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
                        systemConfig.packages[pkgId].map = Object.assign(
                            {},
                            pkg.raw.browser
                        );
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
        const systemConfig = {
            ...baseSystemConfig,
            meta: {
                ...baseSystemConfig.meta,
                [`${this.baseUrl}/*`]: {
                    loader: '@cdn-run-remote',
                },
                ['./*']: {
                    loader: '@cdn-run-local',
                },
            },
        };
        const system = new SystemJSLoader.constructor();
        const virtualFiles: { [pathname: string]: string } = {};

        for (const pathname in this.files) {
            const normalizedPathname = await system.resolve(pathname);
            virtualFiles[normalizedPathname] = this.files[pathname];
        }

        system.config(systemConfig);
        system.registry.set(
            '@cdn-run-local',
            system.newModule({
                fetch: (
                    spec: any,
                    systemFetch: (url: string) => Promise<string>
                ): string | Promise<string> => {
                    const contents = virtualFiles[spec.address];

                    if (typeof contents === 'string') {
                        return contents;
                    }

                    throw new Error(`File not found: ${spec.address}`);
                },
            })
        );
        system.registry.set(
            '@cdn-run-remote',
            system.newModule({
                fetch: (spec: any): string | Promise<string> =>
                    fetch(spec.address, { redirect: 'follow' }).then(res => {
                        if (res.status !== 200)
                            throw new Error(
                                `Unexpected status code fetching ${
                                    spec.address
                                }: ${res.status}`
                            );

                        return res.text();
                    }),
            })
        );

        const normalizedPathname = `./${this.normalizeLocalPathname(pathname)}`;

        return await system.import(normalizedPathname);
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
