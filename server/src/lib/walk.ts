// I just whipped up this SWC AST walker rq because I didn't find any online, but we can move this out of here later.

import type {
	CatchClause,
	ClassMember,
	Declaration,
	Decorator,
	DefaultDecl,
	ExportSpecifier,
	Expression,
	Import,
	ImportSpecifier,
	JSXAttrValue,
	JSXAttributeName,
	JSXAttributeOrSpread,
	JSXClosingElement,
	JSXClosingFragment,
	JSXElementChild,
	JSXElementName,
	JSXExpression,
	JSXObject,
	JSXOpeningElement,
	JSXOpeningFragment,
	Literal,
	Module,
	ModuleDeclaration,
	ModuleExportName,
	ModuleItem,
	NamedImportSpecifier,
	ObjectPatternProperty,
	OptionalChainingCall,
	Param,
	Pattern,
	Program,
	Property,
	PropertyName,
	Statement,
	Super,
	SwitchCase,
	TemplateElement,
	TsEntityName,
	TsEnumMember,
	TsEnumMemberId,
	TsExpressionWithTypeArguments,
	TsFnOrConstructorType,
	TsFnParameter,
	TsInterfaceBody,
	TsLiteral,
	TsModuleName,
	TsModuleReference,
	TsNamespaceBody,
	TsParameterProperty,
	TsParameterPropertyParameter,
	TsThisTypeOrIdent,
	TsTupleElement,
	TsType,
	TsTypeAnnotation,
	TsTypeElement,
	TsTypeParameter,
	TsTypeParameterDeclaration,
	TsTypeParameterInstantiation,
	TsTypeQueryExpr,
	TsUnionOrIntersectionType,
	VariableDeclarator,
} from '@swc/wasm-web';

type NodeType =
	| Module
	| ModuleItem
	| ClassMember
	| Declaration
	| Expression
	| JSXObject
	| JSXExpression
	| JSXElementName
	| JSXAttributeOrSpread
	| JSXAttributeName
	| JSXAttrValue
	| JSXElementChild
	| Literal
	| ModuleDeclaration
	| DefaultDecl
	| ImportSpecifier
	| ModuleExportName
	| ExportSpecifier
	| Program
	| ModuleItem
	| Pattern
	| ObjectPatternProperty
	| Property
	| PropertyName
	| Statement
	| TsParameterPropertyParameter
	| TsEntityName
	| TsTypeElement
	| TsType
	| TsFnOrConstructorType
	| TsFnParameter
	| TsThisTypeOrIdent
	| TsTypeQueryExpr
	| TsUnionOrIntersectionType
	| TsLiteral
	| TsEnumMemberId
	| TsNamespaceBody
	| TsModuleName
	| TsModuleReference
	| Param
	| TsParameterProperty
	| Decorator
	| VariableDeclarator
	| OptionalChainingCall
	| Super
	| Import
	| TemplateElement
	| JSXOpeningElement
	| JSXClosingElement
	| JSXOpeningFragment
	| JSXClosingFragment
	| NamedImportSpecifier
	| SwitchCase
	| CatchClause
	| TsTypeAnnotation
	| TsTypeParameterDeclaration
	| TsTypeParameter
	| TsTypeParameterInstantiation
	| TsTupleElement
	| TsInterfaceBody
	| TsExpressionWithTypeArguments
	| TsEnumMember;

// TODO: Extract all logic into a map for perf and also make it more typesafe (e.g. return type should be a tuple of select keys)
// Maybe we can also use a generic to get the true argument `node` type (remove all spans and primitives)
// Type assertions will be useful too maybe
function getVisitorKeys(node: NodeType) {
	switch (node.type) {
		case 'Module':
		case 'Script':
			return ['body'];
		case 'ArrayExpression':
		case 'ArrayPattern':
			return ['elements'];
		case 'ArrowFunctionExpression':
		case 'MethodProperty':
			return ['params', 'body', 'typeParameters', 'returnType'];
		case 'PrivateName':
			return ['id'];
		case 'ClassProperty':
		case 'PrivateProperty':
			return ['value', 'typeAnnotation', 'key'];
		case 'Parameter':
			return ['decorators', 'pat'];
		case 'Constructor':
			return ['key', 'params', 'body'];
		case 'ClassMethod':
		case 'PrivateMethod':
			return ['function', 'key'];
		case 'StaticBlock':
			return ['body'];
		case 'Decorator':
			return ['expression'];
		case 'FunctionDeclaration':
			return [
				'identifier',
				'body',
				'params',
				'typeParameters',
				'returnType',
				'decorators',
			];
		case 'ClassDeclaration':
			return [
				'body',
				'identifier',
				'superClass',
				'TypeParams',
				'superTypeParams',
				'implements',
			];
		case 'VariableDeclaration':
			return ['declarations'];
		case 'VariableDeclarator':
			return ['init', 'id'];
		case 'Identifier':
			return [];
		case 'OptionalChainingExpression':
			return ['base'];
		case 'CallExpression':
			return ['callee', 'arguments', 'typeArguments'];
		case 'ThisExpression':
			return [];
		case 'ObjectExpression':
			return ['properties'];
		case 'SpreadElement':
			return ['spread'];
		case 'UnaryExpression':
			return ['argument'];
		case 'UpdateExpression':
			return ['argument'];
		case 'BinaryExpression':
			return ['left', 'right'];
		case 'FunctionExpression':
			return [
				'identifier',
				'body',
				'params',
				'typeParameters',
				'returnType',
				'decorators',
			];
		case 'ClassExpression':
			return ['identifier'];
		case 'AssignmentExpression':
			return ['left', 'right'];
		case 'MemberExpression':
			return ['object', 'property'];
		case 'SuperPropExpression':
			return ['obj', 'property'];
		case 'ConditionalExpression':
			return ['test', 'consequent', 'alternate'];
		case 'Super':
		case 'Import':
			return [];
		case 'NewExpression':
			return ['callee', 'arguments', 'typeArguments'];
		case 'SequenceExpression':
			return ['expressions'];
		case 'YieldExpression':
			return ['argument'];
		case 'MetaProperty':
			return [];
		case 'AwaitExpression':
			return ['argument'];
		case 'TemplateLiteral':
			return ['quasis', 'expressions', 'types'];
		case 'TaggedTemplateExpression':
			return ['tag', 'template', 'typeParameters'];
		case 'TemplateElement':
			return [];
		case 'ParenthesisExpression':
			return ['expression'];
		case 'JSXMemberExpression':
			return ['object', 'property'];
		case 'JSXNamespacedName':
			return ['namespace', 'name'];
		case 'JSXEmptyExpression':
			return [];
		case 'JSXExpressionContainer':
			return ['expression'];
		case 'JSXSpreadChild':
			return ['expression'];
		case 'JSXOpeningElement':
			return ['name', 'attributes', 'typeArguments'];
		case 'JSXClosingElement':
			return ['name'];
		case 'JSXAttribute':
			return ['name', 'value'];
		case 'JSXText':
			return [];
		case 'JSXElement':
		case 'JSXFragment':
			return ['opening', 'children', 'closing'];
		case 'JSXOpeningFragment':
		case 'JSXClosingFragment':
			return [];
		case 'StringLiteral':
		case 'BooleanLiteral':
		case 'NumericLiteral':
		case 'NullLiteral':
		case 'RegExpLiteral':
		case 'BigIntLiteral':
			return [];
		case 'ExportDefaultExpression':
			return ['expression'];
		case 'ExportDeclaration':
			return ['declaration'];
		case 'ImportDeclaration':
			return ['specifiers', 'source', 'asserts'];
		case 'ExportAllDeclaration':
			return ['source', 'asserts'];
		case 'ExportNamedDeclaration':
			return ['specifiers', 'source', 'asserts'];
		case 'ExportDefaultDeclaration':
			return ['decl'];
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			return ['local'];
		case 'ImportSpecifier':
			return ['local', 'imported'];
		case 'ExportNamespaceSpecifier':
			return ['name'];
		case 'ExportDefaultSpecifier':
			return ['exported'];
		case 'ExportSpecifier':
			return ['orig', 'exported'];
		case 'ObjectPattern':
			return ['properties'];
		case 'AssignmentPattern':
			return ['left', 'right'];
		case 'RestElement':
			return ['argument'];
		case 'KeyValuePatternProperty':
			return ['key', 'value'];
		case 'AssignmentPatternProperty':
			return ['key', 'value'];
		case 'KeyValueProperty':
		case 'AssignmentProperty':
			return ['key', 'value'];
		case 'GetterProperty':
			return ['typeAnnotation', 'body'];
		case 'SetterProperty':
			return ['param', 'body'];
		case 'Computed':
			return ['expression'];
		case 'BlockStatement':
			return ['stmts'];
		case 'ExpressionStatement':
			return ['expression'];
		case 'EmptyStatement':
		case 'DebuggerStatement':
			return [];
		case 'WithStatement':
			return ['object', 'body'];
		case 'ReturnStatement':
			return ['argument'];
		case 'LabeledStatement':
			return ['label', 'body'];
		case 'BreakStatement':
			return ['label'];
		case 'ContinueStatement':
			return ['label'];
		case 'IfStatement':
			return ['test', 'consequent', 'alternate'];
		case 'SwitchStatement':
			return ['discriminant', 'cases'];
		case 'ThrowStatement':
			return ['argument'];
		case 'TryStatement':
			return ['block', 'handler', 'finalizer'];
		case 'WhileStatement':
		case 'DoWhileStatement':
			return ['test', 'body'];
		case 'ForStatement':
			return ['init', 'test', 'update', 'body'];
		case 'ForOfStatement':
		case 'ForInStatement':
			return ['left', 'right', 'body'];
		case 'SwitchCase':
			return ['test', 'consequent'];
		case 'CatchClause':
			return ['param', 'body'];
		case 'TsTypeAnnotation':
			return ['typeAnnotation'];
		case 'TsTypeParameterDeclaration':
			return ['parameters'];
		case 'TsTypeParameter':
			return ['constraint', 'default', 'name'];
		case 'TsTypeParameterInstantiation':
			return ['params'];
		case 'TsParameterProperty':
			return ['param', 'decorators'];
		case 'TsQualifiedName':
			return ['left', 'right'];
		case 'TsCallSignatureDeclaration':
		case 'TsConstructSignatureDeclaration':
			return ['params', 'typeAnnotations', 'typeParams'];
		case 'TsPropertySignature':
			return ['key', 'expression', 'params', 'typeAnnotation', 'typeParams'];
		case 'TsGetterSignature':
			return ['key', 'typeAnnotation'];
		case 'TsSetterSignature':
			return ['key', 'param'];
		case 'TsMethodSignature':
			return ['key', 'param', 'typeAnn', 'typeParams'];
		case 'TsIndexSignature':
			return ['params', 'typeAnnotation'];
		case 'TsKeywordType':
			return [];
		case 'TsThisType':
			return [];
		case 'TsFunctionType':
			return ['params', 'typeParams', 'typeAnnotation'];
		case 'TsConstructorType':
			return ['params', 'typeParams', 'typeAnnotation'];
		case 'TsTypeReference':
			return ['typeName', 'typeParams'];
		case 'TsTypePredicate':
			return ['param', 'typeAnnotation'];
		case 'TsImportType':
			return ['argument', 'qualifier', 'typeArguments'];
		case 'TsTypeQuery':
			return ['exprName', 'typeArguments'];
		case 'TsTypeLiteral':
			return ['members'];
		case 'TsArrayType':
			return ['elemType'];
		case 'TsTupleType':
			return ['elemTypes'];
		case 'TsTupleElement':
			return ['label', 'ty'];
		case 'TsOptionalType':
		case 'TsRestType':
			return ['typeAnnotation'];
		case 'TsUnionType':
		case 'TsIntersectionType':
			return ['types'];
		case 'TsConditionalType':
			return ['checkType', 'extendsType', 'trueType', 'falseType'];
		case 'TsInferType':
			return ['typeParam'];
		case 'TsParenthesizedType':
			return ['typeAnnotation'];
		case 'TsTypeOperator':
			return ['typeAnnotation'];
		case 'TsIndexedAccessType':
			return ['objectType', 'indexType'];
		case 'TsMappedType':
			return ['typeParam', 'nameType', 'typeAnnotation'];
		case 'TsLiteralType':
			return ['literal'];
		case 'TsInterfaceDeclaration':
			return ['id', 'typeParams', 'extends', 'body'];
		case 'TsInterfaceBody':
			return ['body'];
		case 'TsExpressionWithTypeArguments':
			return ['expression', 'typeArguments'];
		case 'TsTypeAliasDeclaration':
			return ['id', 'typeParams', 'typeAnnotation'];
		case 'TsEnumDeclaration':
			return ['id', 'members'];
		case 'TsEnumMember':
			return ['id', 'init'];
		case 'TsModuleDeclaration':
			return ['id', 'body'];
		case 'TsModuleBlock':
			return ['body'];
		case 'TsNamespaceDeclaration':
			return ['id', 'body'];
		case 'TsImportEqualsDeclaration':
			return ['id', 'moduleRef'];
		case 'TsExternalModuleReference':
			return ['expression'];
		case 'TsExportAssignment':
			return ['id'];
		case 'TsAsExpression':
		case 'TsInstantiation':
		case 'TsTypeAssertion':
			return ['expression', 'typeAnnotation'];
		case 'TsConstAssertion':
		case 'TsNonNullExpression':
			return ['expression'];
		case 'TsNamespaceExportDeclaration':
			return ['id'];
		case 'Invalid':
			return [];
	}
}

type ParentType = (NodeType & { parent: NodeType | null }) | null;

export const States = {
	EXIT: Symbol('FAIL'),
} as const;

type OnlyThat<T, U> = T extends U ? T : never;

export function walk(
	node: NodeType,
	visitor: {
		[Key in NodeType['type'] as Key | `${Key}:exit`]?: (
			node: Extract<NodeType, { type: OnlyThat<Key, NodeType['type']> }>,
			state?: Record<string, any>,
			parent?: NodeType | null
		) =>
			| void
			| boolean
			| Record<string, any>
			| typeof States.EXIT
			// TODO: Record<string, any> overrides this, overhaul how state works in AST Walking
			| { ignore: string[]; state: Record<string, any> };
	},
	state: Record<string, any> = {},
	parent: NodeType | null = null
): void | typeof States.EXIT {
	let ignore: string[] = [];

	if (visitor[node.type]) {
		const result = visitor[node.type]!(node as any, state, parent);
		if (result === false) {
			return;
		} else if (result === States.EXIT) {
			return States.EXIT;
		} else if (result && typeof result === 'object' && 'ignore' in result) {
			ignore = result.ignore;
			state = result.state;
		} else if (typeof result === 'object') {
			state = result;
		}
	}

	const keys = getVisitorKeys(node);

	for (const key of keys) {
		if (key in node) {
			if (ignore.includes(key)) continue;

			if (Array.isArray(node[key as keyof typeof node])) {
				let i = 0;
				for (const child of node[key as keyof typeof node] as unknown as (
					| NodeType
					| { expression: NodeType; spread?: boolean }
				)[]) {
					if (ignore.includes(`${key}.${i++}`)) {
						continue;
					}

					let result;

					if ('type' in child) {
						result = walk(child, visitor, { ...state }, node);
					} else if ('expression' in child) {
						result = walk(child.expression, visitor, { ...state }, node);
					}

					if (result === States.EXIT) {
						return States.EXIT;
					}
				}
			} else if (
				node[key as keyof typeof node] != null &&
				'type' in (node[key as keyof typeof node] as any)
			) {
				const result = walk(
					node[key as keyof typeof node] as unknown as NodeType,
					visitor,
					{ ...state },
					node
				);
				if (result === States.EXIT) {
					return States.EXIT;
				}
			}
		}
	}

	if (`${node.type}:exit` in visitor) {
		const result = visitor[node.type]!(node as any, state, parent);
		if (result === States.EXIT) {
			return States.EXIT;
		}
	}
}
