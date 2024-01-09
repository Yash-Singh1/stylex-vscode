// I just whipped up this SWC AST walker rq because I didn't find any online, but we can move this out of here later.

import type {
  CatchClause,
  ClassMember,
  Declaration,
  Decorator,
  DefaultDecl,
  ExportSpecifier,
  ExprOrSpread,
  Expression,
  Fn,
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
} from "@swc/types";

export type NodeType =
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

// We use a megalothic type here to make sure the visitor key map is always correct
const visitorKeyMap: {
  [Key in NodeType["type"]]: (keyof {
    [K in keyof Extract<NodeType, { type: Key }> as Required<
      Extract<NodeType, { type: Key }>
    >[K] extends
      | NodeType
      | (NodeType | undefined)[]
      | (ExprOrSpread | undefined)[]
      | Fn
      ? K
      : never]: 0;
  })[];
} = {
  Module: ["body"],
  Script: ["body"],
  ArrayExpression: ["elements"],
  ArrayPattern: ["elements"],
  ArrowFunctionExpression: ["params", "body", "typeParameters", "returnType"],
  MethodProperty: ["params", "body", "typeParameters", "returnType"],
  PrivateName: ["id"],
  ClassProperty: ["value", "typeAnnotation", "key"],
  PrivateProperty: ["value", "typeAnnotation", "key"],
  Parameter: ["decorators", "pat"],
  Constructor: ["key", "params", "body"],
  ClassMethod: ["function", "key"],
  PrivateMethod: ["function", "key"],
  StaticBlock: ["body"],
  Decorator: ["expression"],
  FunctionDeclaration: [
    "identifier",
    "body",
    "params",
    "typeParameters",
    "returnType",
    "decorators",
  ],
  ClassDeclaration: [
    "body",
    "identifier",
    "superClass",
    "typeParams",
    "superTypeParams",
    "implements",
  ],
  VariableDeclaration: ["declarations"],
  VariableDeclarator: ["init", "id"],
  Identifier: [],
  OptionalChainingExpression: ["base"],
  CallExpression: ["callee", "arguments", "typeArguments"],
  ThisExpression: [],
  ObjectExpression: ["properties"],
  SpreadElement: ["arguments"],
  UnaryExpression: ["argument"],
  UpdateExpression: ["argument"],
  BinaryExpression: ["left", "right"],
  FunctionExpression: [
    "identifier",
    "body",
    "params",
    "typeParameters",
    "returnType",
    "decorators",
  ],
  ClassExpression: ["identifier"],
  AssignmentExpression: ["left", "right"],
  MemberExpression: ["object", "property"],
  SuperPropExpression: ["obj", "property"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  Super: [],
  Import: [],
  NewExpression: ["callee", "arguments", "typeArguments"],
  SequenceExpression: ["expressions"],
  YieldExpression: ["argument"],
  MetaProperty: [],
  AwaitExpression: ["argument"],
  TemplateLiteral: ["quasis"],
  TaggedTemplateExpression: ["tag", "template", "typeParameters"],
  TemplateElement: [],
  ParenthesisExpression: ["expression"],
  JSXMemberExpression: ["object", "property"],
  JSXNamespacedName: ["namespace", "name"],
  JSXEmptyExpression: [],
  JSXExpressionContainer: ["expression"],
  JSXSpreadChild: ["expression"],
  JSXOpeningElement: ["name", "attributes", "typeArguments"],
  JSXClosingElement: ["name"],
  JSXAttribute: ["name", "value"],
  JSXText: [],
  JSXElement: ["opening", "children", "closing"],
  JSXFragment: ["opening", "children", "closing"],
  JSXOpeningFragment: [],
  JSXClosingFragment: [],
  StringLiteral: [],
  BooleanLiteral: [],
  NumericLiteral: [],
  NullLiteral: [],
  RegExpLiteral: [],
  BigIntLiteral: [],
  ExportDefaultExpression: ["expression"],
  ExportDeclaration: ["declaration"],
  ImportDeclaration: ["specifiers", "source", "asserts"],
  ExportAllDeclaration: ["source", "asserts"],
  ExportNamedDeclaration: ["specifiers", "source", "asserts"],
  ExportDefaultDeclaration: ["decl"],
  ImportDefaultSpecifier: ["local"],
  ImportNamespaceSpecifier: ["local"],
  ImportSpecifier: ["local", "imported"],
  ExportNamespaceSpecifier: ["name"],
  ExportSpecifier: ["orig", "exported"],
  ObjectPattern: ["properties"],
  AssignmentPattern: ["left", "right"],
  RestElement: ["argument"],
  KeyValuePatternProperty: ["key", "value"],
  AssignmentPatternProperty: ["key", "value"],
  KeyValueProperty: ["key", "value"],
  AssignmentProperty: ["key", "value"],
  GetterProperty: ["typeAnnotation", "body"],
  SetterProperty: ["param", "body"],
  BlockStatement: ["stmts"],
  ExpressionStatement: ["expression"],
  EmptyStatement: [],
  DebuggerStatement: [],
  WithStatement: ["object", "body"],
  ReturnStatement: ["argument"],
  LabeledStatement: ["label", "body"],
  BreakStatement: ["label"],
  ContinueStatement: ["label"],
  IfStatement: ["test", "consequent", "alternate"],
  SwitchStatement: ["discriminant", "cases"],
  ThrowStatement: ["argument"],
  TryStatement: ["block", "handler", "finalizer"],
  WhileStatement: ["test", "body"],
  DoWhileStatement: ["test", "body"],
  ForStatement: ["init", "test", "update", "body"],
  ForOfStatement: ["left", "right", "body"],
  ForInStatement: ["left", "right", "body"],
  SwitchCase: ["test", "consequent"],
  CatchClause: ["param", "body"],
  TsTypeAnnotation: ["typeAnnotation"],
  TsTypeParameterDeclaration: ["parameters"],
  TsTypeParameter: ["constraint", "default", "name"],
  TsTypeParameterInstantiation: ["params"],
  TsParameterProperty: ["param", "decorators"],
  TsQualifiedName: ["left", "right"],
  TsCallSignatureDeclaration: ["params", "typeAnnotation", "typeParams"],
  TsConstructSignatureDeclaration: ["params", "typeAnnotation", "typeParams"],
  TsPropertySignature: [
    "key",
    "init",
    "params",
    "typeAnnotation",
    "typeParams",
  ],
  TsGetterSignature: ["key", "typeAnnotation"],
  TsSetterSignature: ["key", "param"],
  TsMethodSignature: ["key", "params", "typeAnn", "typeParams"],
  TsIndexSignature: ["params", "typeAnnotation"],
  TsKeywordType: [],
  TsThisType: [],
  TsFunctionType: ["params", "typeParams", "typeAnnotation"],
  TsConstructorType: ["params", "typeParams", "typeAnnotation"],
  TsTypeReference: ["typeName", "typeParams"],
  TsTypePredicate: ["paramName", "typeAnnotation"],
  TsImportType: ["argument", "qualifier", "typeArguments"],
  TsTypeQuery: ["exprName", "typeArguments"],
  TsTypeLiteral: ["members"],
  TsArrayType: ["elemType"],
  TsTupleType: ["elemTypes"],
  TsTupleElement: ["label", "ty"],
  TsOptionalType: ["typeAnnotation"],
  TsRestType: ["typeAnnotation"],
  TsUnionType: ["types"],
  TsIntersectionType: ["types"],
  TsConditionalType: ["checkType", "extendsType", "trueType", "falseType"],
  TsInferType: ["typeParam"],
  TsParenthesizedType: ["typeAnnotation"],
  TsTypeOperator: ["typeAnnotation"],
  TsIndexedAccessType: ["objectType", "indexType"],
  TsMappedType: ["typeParam", "nameType", "typeAnnotation"],
  TsLiteralType: ["literal"],
  TsInterfaceDeclaration: ["id", "typeParams", "extends", "body"],
  TsInterfaceBody: ["body"],
  TsExpressionWithTypeArguments: ["expression", "typeArguments"],
  TsTypeAliasDeclaration: ["id", "typeParams", "typeAnnotation"],
  TsEnumDeclaration: ["id", "members"],
  TsEnumMember: ["id", "init"],
  TsModuleDeclaration: ["id", "body"],
  TsModuleBlock: ["body"],
  TsNamespaceDeclaration: ["id", "body"],
  TsImportEqualsDeclaration: ["id", "moduleRef"],
  TsExternalModuleReference: ["expression"],
  TsExportAssignment: ["expression"],
  TsAsExpression: ["expression", "typeAnnotation"],
  TsInstantiation: ["expression", "typeArguments"],
  TsTypeAssertion: ["expression", "typeAnnotation"],
  TsConstAssertion: ["expression"],
  TsNonNullExpression: ["expression"],
  TsNamespaceExportDeclaration: ["id"],
  ExportDefaultSpecifier: ["exported"],
  Computed: ["expression"],
  TsSatisfiesExpression: ["expression", "typeAnnotation"],
  Invalid: [],
};

function getVisitorKeys(node: NodeType) {
  const resultingKeys = visitorKeyMap[node.type];
  if (!resultingKeys) {
    throw new Error(`No visitor keys found for node type ${node.type}`);
  }
  return resultingKeys;
}

export const States = {
  EXIT: Symbol("EXIT"),
} as const;

type OnlyThat<T, U> = T extends U ? T : never;

export function walk(
  node: NodeType,
  visitor: {
    [Key in NodeType["type"] as Key | `${Key}:exit`]?: (
      node: Extract<NodeType, { type: OnlyThat<Key, NodeType["type"]> }>,
      state?: Record<string, any>,
      parent?: NodeType | null,
    ) =>
      | void
      | boolean
      | Record<string, any>
      | typeof States.EXIT
      // TODO: Record<string, any> overrides this, overhaul how state works in AST Walking
      | { ignore: string[]; state: Record<string, any> };
  } & { "*"?: (node: NodeType) => boolean | void },
  state: Record<string, any> = {},
  parent: NodeType | null = null,
): void | typeof States.EXIT {
  let ignore: string[] = [];

  if (visitor[node.type]) {
    const result = visitor[node.type]!(node as any, state, parent);
    if (result === false) {
      return;
    } else if (result === States.EXIT) {
      return States.EXIT;
    } else if (result && typeof result === "object" && "ignore" in result) {
      ignore = result.ignore;
      state = result.state;
    } else if (typeof result === "object") {
      state = result;
    }
  }

  if ("*" in visitor) {
    const result = visitor["*"]!(node);
    if (result === false) {
      return;
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

          if ("type" in child) {
            result = walk(child, visitor, { ...state }, node);
          } else if ("expression" in child) {
            result = walk(child.expression, visitor, { ...state }, node);
          }

          if (result === States.EXIT) {
            return States.EXIT;
          }
        }
      } else if (
        node[key as keyof typeof node] != null &&
        "type" in (node[key as keyof typeof node] as any)
      ) {
        const result = walk(
          node[key as keyof typeof node] as unknown as NodeType,
          visitor,
          { ...state },
          node,
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
