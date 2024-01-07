/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentColorParams,
	ColorInformation,
	Hover,
	Position,
	MarkupKind,
	TextEdit,
} from 'vscode-languageserver/node';

import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';

const wasmBuffer = readFileSync('../node_modules/@swc/wasm-web/wasm-web_bg.wasm');

import { TextDocument } from 'vscode-languageserver-textdocument';
import { States, walk } from './lib/walk';
import { culoriColorToVscodeColor, getColorFromValue } from './lib/color-logic';
import { type Color, formatHex8, formatRgb, formatHsl } from 'culori';
import { Identifier, StringLiteral } from '@swc/wasm-web/wasm-web.js';
import { evaluate } from './lib/evaluate';
import StateManager from './lib/state-manager';
import { handleImports } from './lib/imports-handler';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Wrap server in async functions to allow "top-level await"
(async function () {
	const init = await import('@swc/wasm-web/wasm-web.js');
	await init.default(wasmBuffer);

	connection.onInitialize((params: InitializeParams) => {
		const capabilities = params.capabilities;

		// Does the client support the `workspace/configuration` request?
		// If not, we fall back using global settings.
		hasConfigurationCapability = !!(
			capabilities.workspace && !!capabilities.workspace.configuration
		);
		hasWorkspaceFolderCapability = !!(
			capabilities.workspace && !!capabilities.workspace.workspaceFolders
		);
		hasDiagnosticRelatedInformationCapability = !!(
			capabilities.textDocument &&
			capabilities.textDocument.publishDiagnostics &&
			capabilities.textDocument.publishDiagnostics.relatedInformation
		);

		const result: InitializeResult = {
			capabilities: {
				textDocumentSync: TextDocumentSyncKind.Incremental,
				// Tell the client that this server supports code completion.
				completionProvider: {
					// triggerCharacters: ['"', "'"],
				},
				colorProvider: true,
				hoverProvider: true,
			},
		};
		if (hasWorkspaceFolderCapability) {
			result.capabilities.workspace = {
				workspaceFolders: {
					supported: true,
				},
			};
		}
		return result;
	});

	connection.onInitialized(() => {
		if (hasConfigurationCapability) {
			// Register for all configuration changes.
			connection.client.register(DidChangeConfigurationNotification.type, undefined);
		}
		if (hasWorkspaceFolderCapability) {
			connection.workspace.onDidChangeWorkspaceFolders((_event) => {
				connection.console.log('Workspace folder change event received.');
			});
		}
	});

	// The example settings
	interface ExampleSettings {
		maxNumberOfProblems: number;
	}

	// The global settings, used when the `workspace/configuration` request is not supported by the client.
	// Please note that this is not the case when using this server with the client provided in this example
	// but could happen with other clients.
	const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
	let globalSettings: ExampleSettings = defaultSettings;

	// Cache the settings of all open documents
	const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

	connection.onDidChangeConfiguration((change) => {
		if (hasConfigurationCapability) {
			// Reset all cached document settings
			documentSettings.clear();
		} else {
			globalSettings = <ExampleSettings>(
				(change.settings.languageServerExample || defaultSettings)
			);
		}

		// Revalidate all open text documents
		documents.all().forEach(validateTextDocument);
	});

	function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
		if (!hasConfigurationCapability) {
			return Promise.resolve(globalSettings);
		}
		let result = documentSettings.get(resource);
		if (!result) {
			result = connection.workspace.getConfiguration({
				scopeUri: resource,
				section: 'languageServerExample',
			});
			documentSettings.set(resource, result);
		}
		return result;
	}

	// Only keep settings for open documents
	documents.onDidClose((e) => {
		documentSettings.delete(e.document.uri);
	});

	// The content of a text document has changed. This event is emitted
	// when the text document first opened or when its content has changed.
	documents.onDidChangeContent((change) => {
		validateTextDocument(change.document);
	});

	async function validateTextDocument(textDocument: TextDocument): Promise<void> {
		// In this simple example we get the settings for every validate run.
		const settings = await getDocumentSettings(textDocument.uri);

		// The validator creates diagnostics for all uppercase words length 2 and more
		const text = textDocument.getText();
		const pattern = /\b[A-Z]{2,}\b/g;
		let m: RegExpExecArray | null;

		let problems = 0;
		const diagnostics: Diagnostic[] = [];
		while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
			problems++;
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length),
				},
				message: `${m[0]} is all uppercase.`,
				source: 'ex',
			};
			if (hasDiagnosticRelatedInformationCapability) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, diagnostic.range),
						},
						message: 'Spelling matters',
					},
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, diagnostic.range),
						},
						message: 'Particularly for names',
					},
				];
			}
			diagnostics.push(diagnostic);
		}

		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	}

	connection.onDidOpenTextDocument((_change) => {
		// Monitored files have change in VSCode
		connection.console.log('We received a file change event');
	});

	// This handler provides the completion items.
	connection.onCompletion(
		(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
			const textDocument = documents.get(textDocumentPosition.textDocument.uri)!;
			const text = textDocument.getText();

			let doubleQuoteCount = 0,
				singleQuoteCount = 0;
			for (const char of text) {
				if (char === '"') doubleQuoteCount++;
				else if (char === "'") singleQuoteCount++;
			}

			let quote = "'";
			if (doubleQuoteCount > singleQuoteCount) {
				quote = '"';
			}

			return [
				// TODO: Make this have a code action maybe? Or it would be better if StyleX shifted away from all imports
				// @see https://github.com/facebook/stylex/discussions/261
				{
					label: 'Import StyleX',
					kind: CompletionItemKind.Reference,
					insertText: `import stylex from ${quote}@stylexjs/stylex${quote};`,
				},
				// TODO: Look into using CSS Language Server for more completion items
			];
		}
	);

	// TODO: Figure out how to cache this
	const colorCache = new Map<string, ColorInformation['color']>();

	// We might want to limit this to color restricted properties to allow further reliability (idk)
	// @see https://github.com/microsoft/vscode-css-languageservice/blob/main/src/data/webCustomData.ts
	connection.onDocumentColor((params: DocumentColorParams) => {
		// console.log(params);
		const textDocument = documents.get(params.textDocument.uri)!;
		const text = textDocument.getText();

		// TODO: Language ID configuration
		// console.log(textDocument.languageId);
		// if (!jsLanguages.includes(textDocument.languageId)) {
		// 	return [];
		// }

		let parseResult;
		try {
			parseResult = init.parseSync(text, {
				syntax: 'typescript',
				tsx: true,
				target: 'es2022',
				comments: false,
				decorators: true,
				dynamicImport: true,
			});
		} catch (e) {
			console.log(e);
			return [];
		}

		console.log(parseResult);

		const colors: ColorInformation[] = [];

		const stateManager = new StateManager();

		let moduleStart = 0;

		function handleStringLiteral(
			node: StringLiteral | { value: string; span: StringLiteral['span'] }
		) {
			const color = getColorFromValue(node.value);
			console.log('colorval', color);
			if (color === null || typeof color === 'string' || (color.alpha ?? 1) === 0) {
				return false;
			}

			return {
				range: {
					// Offsets to keep colors inside the quotes
					start: textDocument.positionAt(node.span.start - moduleStart + 1),
					end: textDocument.positionAt(node.span.end - moduleStart - 1),
				},
				color: culoriColorToVscodeColor(color),
			};
		}

		walk(
			parseResult,
			{
				Module(node) {
					moduleStart = node.span.start;
				},

				ImportDeclaration(node) {
					handleImports(node, stateManager);

					return false;
				},

				CallExpression(node) {
					let verifiedImport: string | undefined;

					if (
						(node.callee.type === 'MemberExpression' &&
							node.callee.property.type === 'Identifier' &&
							(node.callee.property.value === 'create' ||
								node.callee.property.value === 'createTheme' ||
								node.callee.property.value === 'defineVars' ||
								node.callee.property.value === 'keyframes') &&
							node.callee.object.type === 'Identifier' &&
							stateManager.verifyStylexIdentifier(
								node.callee.object.value
							)) ||
						(node.callee.type === 'Identifier' &&
							['create', 'createTheme', 'defineVars', 'keyframes'].includes(
								(verifiedImport = stateManager.verifyNamedImport(
									node.callee.value
								)) || ''
							) &&
							verifiedImport)
					) {
						return {
							callInside:
								node.callee.type === 'Identifier'
									? verifiedImport
									: (<Identifier>node.callee.property).value,
						};
					}

					return {
						callInside: null,
					};
				},

				KeyValueProperty(node, state) {
					console.log(state, inspect(node));
					if (state && state.callInside != null) {
						const resultingValue = evaluate(node.value, stateManager);

						console.log('resultingValue', resultingValue);

						if (resultingValue.static && 'value' in resultingValue) {
							if (typeof resultingValue.value === 'string') {
								const color = handleStringLiteral({
									value: resultingValue.value,
									span: resultingValue.span,
								});
								if (color) colors.push(color);
							} else if (Array.isArray(resultingValue.value)) {
								for (const element of resultingValue.value) {
									if (
										element.static &&
										'value' in element &&
										typeof element.value === 'string'
									) {
										const color = handleStringLiteral({
											value: element.value,
											span: element.span,
										});
										if (color) colors.push(color);
									}
								}
							}
						}
					}
				},
			},
			{ callInside: null }
		);

		colorCache.clear();
		colors.forEach((color) => {
			colorCache.set(
				`${params.textDocument.uri}:${color.range.start.line}:${color.range.start.character}:${color.range.end.line}:${color.range.end.character}`,
				color.color
			);
		});

		return colors;
	});

	connection.onColorPresentation((params) => {
		const prevColor = colorCache.get(
			`${params.textDocument.uri}:${params.range.start.line}:${params.range.start.character}:${params.range.end.line}:${params.range.end.character}`
		);

		const colorValue = prevColor
			? /* prettier-ignore */ {
					mode: 'rgb',
					r: prevColor.red,
					g: prevColor.green,
					b: prevColor.blue,
					alpha: prevColor.alpha,
				} satisfies Color
			: undefined;

		const newColor = {
			mode: 'rgb',
			r: params.color.red,
			g: params.color.green,
			b: params.color.blue,
			alpha: params.color.alpha,
		} satisfies Color;
		let hexValue = formatHex8(newColor);

		if (
			params.color.alpha === 1 &&
			(!colorValue || !colorValue.alpha || colorValue.alpha === 1)
		) {
			hexValue = hexValue.replace(/ff$/, '');
		}

		return [
			{
				label: hexValue,
			},
			{
				label: formatRgb(newColor),
			},
			{
				label: formatHsl(newColor),
			},
		];
	});

	const hoverCache = new Map<string, Required<Hover>[]>();

	connection.onHover((params) => {
		console.log(params);

		const document = documents.get(params.textDocument.uri)!;
		const text = document.getText();

		// TODO: Actually get caching working
		if (hoverCache.has(params.textDocument.uri)) {
			const styleHovers = hoverCache.get(params.textDocument.uri)!;

			// TODO: Use binary search for perf on large files
			for (const styleHover of styleHovers) {
				const start = styleHover.range.start;
				const end = styleHover.range.end;

				if (
					params.position.line >= start.line &&
					(params.position.line !== start.line ||
						params.position.character >= start.character) &&
					params.position.line <= end.line &&
					(params.position.line !== end.line ||
						params.position.character <= end.character)
				) {
					return styleHover;
				}
			}
		}

		let parseResult;
		try {
			parseResult = init.parseSync(text, {
				syntax: 'typescript',
				tsx: true,
				target: 'es2022',
				comments: false,
				decorators: true,
				dynamicImport: true,
			});
		} catch (e) {
			console.log(e);
			return undefined;
		}

		let moduleStart = 0;

		const stateManager = new StateManager();

		// Resulting hover
		let hover: Hover | undefined = undefined;

		walk(
			parseResult,
			{
				Module(node) {
					moduleStart = node.span.start;
					stateManager.pushConstantScope();
				},

				BlockStatement() {
					stateManager.pushConstantScope();
				},

				'BlockStatement:exit'() {
					stateManager.popConstantScope();
				},

				VariableDeclaration(node) {
					if (node.kind === 'const') {
						for (const declaration of node.declarations) {
							// TODO: Support more static things
							if (
								declaration.init &&
								declaration.init.type === 'StringLiteral' &&
								declaration.id.type === 'Identifier'
							) {
								stateManager.addConstantToScope(
									declaration.id.value,
									declaration.init.value
								);
							}
						}
					}
				},

				ImportDeclaration(node) {
					handleImports(node, stateManager);

					return false;
				},

				CallExpression(node, state, parent) {
					let verifiedImport: string | undefined;

					if (
						(node.callee.type === 'MemberExpression' &&
							node.callee.object.type === 'Identifier' &&
							stateManager.verifyStylexIdentifier(node.callee.object.value) &&
							node.callee.property.type === 'Identifier' &&
							(verifiedImport = node.callee.property.value)) ||
						(node.callee.type === 'Identifier' &&
							['create', 'createTheme', 'defineVars'].includes(
								(verifiedImport = stateManager.verifyNamedImport(
									node.callee.value
								)) || ''
							) &&
							verifiedImport)
					) {
						if (verifiedImport === 'create') {
							return {
								...state,
								callInside: 'create',
							};
						} else if (
							verifiedImport === 'createTheme' ||
							verifiedImport === 'defineVars'
						) {
							const callerID =
								parent?.type === 'VariableDeclarator' ? parent.id : null;

							return {
								state: {
									...state,
									callInside: verifiedImport,
									callerIdentifier:
										callerID?.type === 'Identifier'
											? callerID.value
											: null,
								},
								ignore: [
									verifiedImport === 'createTheme' ? 'arguments.0' : '',
									'callee',
								],
							};
						}
					}

					return {
						...state,
						callInside: null,
					};
				},

				WithStatement() {
					return false;
				},

				KeyValueProperty(node, state) {
					console.log(state, inspect(node));

					let key: string | undefined;

					if (
						node.key.type === 'Identifier' ||
						node.key.type === 'StringLiteral'
					) {
						key = node.key.value;
					} else if (node.key.type === 'Computed') {
						if (node.key.expression.type === 'StringLiteral') {
							key = node.key.expression.value;
						} else if (node.key.expression.type === 'Identifier') {
							key = stateManager
								.getConstantFromScope(node.key.expression.value)
								?.toString();
						}
					}

					if (state && key && state.callInside) {
						if (node.value.type === 'ObjectExpression') {
							return { ...state, parentClass: [...state.parentClass, key] };
						}

						const startSpanRelative = document.positionAt(
							node.key.span.start - moduleStart
						);
						const endSpanRelative = document.positionAt(
							node.key.span.end - moduleStart
						);

						// Don't use out of range nodes
						if (
							!(
								params.position.line >= startSpanRelative.line &&
								params.position.line <= endSpanRelative.line &&
								(params.position.line !== startSpanRelative.line ||
									params.position.character >=
										startSpanRelative.character) &&
								(params.position.line !== endSpanRelative.line ||
									params.position.character <= endSpanRelative.character)
							)
						) {
							return state;
						}

						console.log('made it here', state, key, node.value.type);
						const classLine = [
							...(state.callInside === 'create'
								? []
								: /* prettier-ignore */ [
										state.callerIdentifier
											? `.${state.callerIdentifier}`
											: ':root',
									]),
							...(<string[]>state.parentClass).slice(
								state.callInside === 'create' ? 0 : 1
							),
							key,
						];

						const atIncluded = classLine.filter((className) =>
							className.startsWith('@')
						);
						const indentation = '  '.repeat(atIncluded.length + 1);

						const cssLines: string[] = [];

						let indentSize = 0;

						for (const atInclude of atIncluded) {
							cssLines.push(`${'  '.repeat(indentSize++)}${atInclude} {`);
						}

						const parentSelector =
							state.callInside === 'create'
								? /* prettier-ignore */ '.' +
									(classLine
										.slice(0)
										.filter(
											(className, index) =>
												index === 0 ||
												(className !== 'default' &&
													className.startsWith(':'))
										)
										.sort()
										.reverse()
										.join('') || 'unknown')
								: classLine[0];

						const propertyName =
							state.callInside === 'create'
								? classLine
										.reverse()
										.find(
											(className) =>
												!(
													className.startsWith(':') ||
													className.startsWith('@') ||
													className === 'default'
												)
										)
								: `--${state.parentClass[0] || key}`;

						cssLines.push(`${indentation.slice(2)}${parentSelector} {`);

						const staticValue = evaluate(node.value, stateManager);

						// TODO: Support identifiers from themes
						if (staticValue.static) {
							if ('value' in staticValue) {
								if (staticValue.value == null) {
									cssLines.push(
										`${indentation}${propertyName}: initial;`
									);
								} else if (typeof staticValue.value === 'string') {
									cssLines.push(
										`${indentation}${propertyName}: ${staticValue.value};`
									);
								} else if (Array.isArray(staticValue.value)) {
									for (const element of staticValue.value) {
										if (element.static && 'value' in element) {
											if (typeof element.value === 'string') {
												cssLines.push(
													`${indentation}${propertyName}: ${element.value};`
												);
											} else if (element.value == null) {
												cssLines.push(
													`${indentation}${propertyName}: initial;`
												);
											} else if (typeof element.value === 'number') {
												// TODO: Infer units based on property name
												cssLines.push(
													`${indentation}${propertyName}: ${element.value};`
												);
											}
										}
									}
								} else if (typeof staticValue.value === 'number') {
									cssLines.push(
										`${indentation}${propertyName}: ${staticValue.value};`
									);
								}
							}
						}

						cssLines.push(`${indentation.slice(2)}}`);

						for (let atIndex = 0; atIndex < atIncluded.length; ++atIndex) {
							cssLines.push(`${'  '.repeat(--indentSize)}}`);
						}

						console.log('cssLines', cssLines);

						if (cssLines.length > 2) {
							hover = {
								contents: {
									kind: MarkupKind.Markdown,
									value: ['```css', ...cssLines, '```'].join('\n'),
								},
								range: {
									start: document.positionAt(
										node.key.span.start - moduleStart
									),
									end: document.positionAt(
										node.key.span.end - moduleStart
									),
								},
							};

							console.log('Successfully found hover', hover);
							return States.EXIT;
						}
					}

					return state;
				},
			},
			{ parentClass: [], callInside: null }
		);

		return hover;
	});

	// Make the text document manager listen on the connection
	// for open, change and close text document events
	documents.listen(connection);

	// Listen on the connection
	connection.listen();
})();
