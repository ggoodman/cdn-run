import { CompilerOptions } from 'typescript';

import { Context, DependencyMap } from './';

export function onBeforeResolveDependencies(
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
}
export function onBeforeSystemConfig(
    this: Context,
    systemConfig: SystemJSLoader.Config,
    presetOptions: any = {}
): SystemJSLoader.Config {
    const shimModules = ['crypto', 'fs', 'path', 'os', 'source-map-support'];

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

    systemConfig.packages[
        pluginTypescriptMapping
    ].format = <SystemJSLoader.ModuleFormat>'system';
    systemConfig.packages[typescriptMapping].format = 'cjs';

    systemConfig.packages[typescriptMapping].meta = {
        ...(systemConfig.packages[typescriptMapping].meta || {}),
        'lib/typescript.js': {
            exports: 'ts',
        },
    };

    for (const coreModuleName of shimModules) {
        if (!systemConfig.packages[typescriptMapping].map[coreModuleName]) {
            systemConfig.packages[typescriptMapping].map[coreModuleName] =
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
}
