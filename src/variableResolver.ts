/**-----------------------------------------------------------------------------
 * Variable Resolver
 *
 * Resolves variables in a string with respect to a workspace or file
 *
 * Based on code from:
 * - https://github.com/microsoft/vscode/blob/9450b5e5fb04f2a180cfffc4d27f52f972b1f369/src/vs/workbench/services/configurationResolver/common/variableResolver.ts
 * - https://github.com/microsoft/vscode/blob/9f1aa3c9feecd04a79d22fd6752ba14a83b48f1b/src/vs/workbench/services/configurationResolver/browser/configurationResolverService.ts
 *----------------------------------------------------------------------------*/

import escapeStringRegexp = require('escape-string-regexp');
import * as fs from 'node:fs';
import { platform } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { DEBUG } from './config';

/** Get file name without extension */
export function fileBasenameNoExtension(uri: vscode.Uri): string {
    return path.basename(uri.fsPath, path.extname(uri.fsPath));
}

/** Resolves variables formatted like `${VAR_NAME}` within a string */
export class VariableResolver {
    // Regex patterns to identify variables
    private static readonly VARIABLE_REGEXP = /\${(.*?)}/g;
    // private static readonly VARIABLE_REGEXP_SINGLE = /\$\{(.*?)\}/; // Unused
    private static readonly VERSION_FORMAT = /\${#}/g;

    private readonly _variables: string[] = [
        'workspaceFolder',
        'workspaceFolderBasename',
        'file',
        'relativeFile',
        'relativeFileDirname',
        'fileBasename',
        'fileBasenameNoExtension',
        'fileDirname',
        'fileExtname',
        'exportExtension',
        '#',
        'noMatch',
    ];

    // Default naming pattern
    private readonly _defaultPattern =
        '${fileBasenameNoExtension}.${exportExtension}';
    private readonly _isWindows: boolean;
    // private _config: ScadConfig;

    constructor() {
        // this._config = config
        this._isWindows = platform() === 'win32';
    }

    /** Resolve variables in string given a file URI */
    public async resolveString(
        pattern: string = this._defaultPattern,
        resource: vscode.Uri,
        exportExtension?: string
    ): Promise<string> {
        // if (DEBUG) console.log(`resolveString pattern: ${pattern}`); // DEBUG

        // Replace all variable pattern matches '${VAR_NAME}'
        const replaced = pattern.replace(
            VariableResolver.VARIABLE_REGEXP,
            (match: string, variable: string) => {
                const resolvedValue = this.evaluateSingleVariable(
                    match,
                    variable,
                    resource,
                    exportExtension
                );

                return resolvedValue;
            }
        );

        // Get dynamic version number
        const version = await this.getVersionNumber(replaced, resource);

        if (DEBUG) console.log(`Version number: ${version}`);

        // Cases for version number
        switch (version) {
            // No version number
            case -1:
                return replaced;
            // Error while parsing files in export directory
            case -2:
                vscode.window.showErrorMessage(
                    `Could not read files in directory specified for export`
                );
                return replaced;
            // Create an empty directory; version 1 by default
            case -3:
                return replaced.replace(
                    VariableResolver.VERSION_FORMAT,
                    String(1)
                );
            default:
                // Substitute version number
                return replaced.replace(
                    VariableResolver.VERSION_FORMAT,
                    String(version)
                );
        }
    }

    /** Tests all variables */
    public testVars(resource: vscode.Uri): void {
        if (DEBUG) console.log('Testing evaluateSingleVariable()...');

        for (const variable of this._variables) {
            if (DEBUG)
                console.log(
                    `${variable} : ${this.evaluateSingleVariable(
                        '${' + variable + '}',
                        variable,
                        resource,
                        'test'
                    )}`
                );
        }
    }

    /** Evaluate a single variable in format '${VAR_NAME}'
     *
     * See also: https://code.visualstudio.com/docs/editor/variables-reference
     */
    private evaluateSingleVariable(
        match: string,
        variable: string,
        resource: vscode.Uri,
        exportExtension = 'scad'
    ): string {
        const workspaceFolder =
            vscode.workspace.getWorkspaceFolder(resource)?.uri.fsPath;

        switch (variable) {
            case 'workspaceFolder':
                return workspaceFolder || match;
            case 'workspaceFolderBasename':
                return path.basename(workspaceFolder || '') || match;
            case 'file':
                return resource.fsPath;
            case 'relativeFile':
                return path.relative(workspaceFolder || '', resource.fsPath);
            case 'relativeFileDirname':
                return path.basename(path.dirname(resource.fsPath));
            case 'fileBasename':
                return path.basename(resource.fsPath);
            case 'fileBasenameNoExtension':
                return fileBasenameNoExtension(resource);
            case 'fileDirname':
                return path.dirname(resource.fsPath);
            case 'fileExtname':
                return path.extname(resource.fsPath);
            case 'exportExtension':
                return exportExtension ? exportExtension : match;
            // We will evaluate the number later
            case '#':
            default:
                return match;
        }
    }

    /** Evaluate version number in format '${#}' */
    private async getVersionNumber(
        pattern: string,
        resource: vscode.Uri
    ): Promise<number> {
        // No version number in string: return -1
        if (!VariableResolver.VERSION_FORMAT.test(pattern)) return -1;

        // Replace the number placeholder with a regex number capture pattern
        // Regexp is case insensitive if OS is Windows
        const patternAsRegexp = new RegExp(
            escapeStringRegexp(path.basename(pattern)).replace(
                '\\$\\{#\\}',
                '([1-9][0-9]*)'
            ),
            this._isWindows ? 'i' : ''
        );

        // Get file directory. If the path is not absolute, get the path of
        // `resource`. Note that `pattern` may contain a directory
        const fileDirectory = path.isAbsolute(pattern)
            ? path.dirname(pattern)
            : path.dirname(path.join(path.dirname(resource.fsPath), pattern));

        // Make export directory if it doesn't exist
        try {
            await fs.promises.access(fileDirectory, fs.constants.W_OK);
        } catch {
            await fs.promises.mkdir(fileDirectory);
            return -3;
        }

        // Read all files in directory
        const versionNumber: number = await new Promise((resolve, reject) => {
            fs.readdir(fileDirectory, (error, files) => {
                // Error; Return -2 (dir read error)
                if (error) {
                    if (DEBUG) console.error(error);
                    reject(-2); // File read error
                }

                // Get all the files that match the pattern (with different version numbers)
                const lastVersion = Math.max(
                    ...files.map((fileName) => {
                        return Number(patternAsRegexp.exec(fileName)?.[1] || 0);
                    })
                );

                // if (DEBUG) console.log(`Last version: ${lastVersion}`); // DEBUG

                resolve(lastVersion);
            });
        });

        // if (DEBUG) console.log(`Version num: ${versionNum}`);   // DEBUG

        // Return next version
        return versionNumber < 0 ? versionNumber : versionNumber + 1;

        // Consider adding case for MAX_SAFE_NUMBER (despite it's unlikeliness)
    }

    public get defaultPattern(): string {
        return this._defaultPattern;
    }
}
