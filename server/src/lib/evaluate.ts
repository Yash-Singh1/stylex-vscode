import type { ComputedPropName, Expression, Span, TemplateElement } from '@swc/wasm-web';

type ResultType =
	| /* prettier-ignore */ {
			value: InnerType;
			static: false;
		}
	| /* prettier-ignore */ {
			value: InnerType;
			static: true;
			span: Span;
		}
	| /* prettier-ignore */ {
			id: string;
			static: true;
			span: Span;
		};

type InnerType =
	| ResultType[]
	| string
	| number
	| boolean
	| null
	| undefined
	| RegExp
	| Record<string, ResultType>
	| bigint;

export function evaluate(
	node: Expression | ComputedPropName | TemplateElement
): ResultType {
	switch (node.type) {
		case 'StringLiteral':
		case 'NumericLiteral':
		case 'BooleanLiteral':
		case 'BigIntLiteral':
			return { value: node.value, static: true, span: node.span };
		case 'NullLiteral':
			return { value: null, static: true, span: node.span };
		case 'RegExpLiteral':
			return {
				value: new RegExp(node.pattern, node.flags),
				static: true,
				span: node.span,
			};
		case 'Invalid':
			throw new Error('Invalid expression');
		case 'Identifier':
			if (node.value === 'undefined')
				return { value: undefined, static: true, span: node.span };
			else {
				return { id: node.value, static: true, span: node.span };
				// TODO: Expose scope manager
				throw new Error('Identifier not implemented');
			}
		case 'ArrayExpression': {
			const result = node.elements.reduce<any[] | false>(
				(accumalator, exprOrSpread) => {
					if (!exprOrSpread || !accumalator) return accumalator;
					if (exprOrSpread.spread) {
						const result = evaluate(exprOrSpread.expression);

						if (!result.static) {
							accumalator.push(result);
						}

						accumalator.push(
							...(<any[]>(
								(result &&
								typeof result === 'object' &&
								(Array.isArray(result) ||
									(Symbol.iterator in result &&
										typeof result[Symbol.iterator] === 'function'))
									? result
									: [result])
							))
						);
					} else {
						accumalator.push(evaluate(exprOrSpread.expression));
					}
					return accumalator;
				},
				[]
			);

			if (result === false) {
				return { value: undefined, static: false };
			} else {
				return { value: result, static: true, span: node.span };
			}
		}

		case 'ObjectExpression': {
			const result = node.properties.reduce<Record<string, ResultType>>(
				(accumalator, property) => {
					if (property.type === 'SpreadElement') {
						const result = evaluate(property.arguments);
						if (result && typeof result === 'object' && 'value' in result) {
							if (!result.static) return accumalator;
							accumalator = Object.assign(accumalator, result.value);
						}
						return accumalator;
					}

					switch (property.type) {
						case 'KeyValueProperty':
						case 'AssignmentProperty': {
							const keyVal = evaluate(property.key);
							if (
								typeof keyVal === 'string' ||
								typeof keyVal === 'number' ||
								typeof keyVal === 'symbol'
							) {
								accumalator[keyVal] = evaluate(property.value);
							}
							break;
						}

						case 'GetterProperty':
						case 'SetterProperty':
						case 'MethodProperty': {
							return accumalator;
						}

						case 'Identifier': {
							const result = evaluate(property);
							if (!result.static) return accumalator;
							accumalator[property.value] = result;
							break;
						}
					}

					return accumalator;
				},
				{}
			);

			return { value: result, static: true, span: node.span };
		}

		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return { value: undefined, static: false };

		case 'AwaitExpression': {
			const result = evaluate(node.argument);
			if (!result.static) return { value: undefined, static: false };
			return result;
		}

		case 'BinaryExpression': {
			const left = evaluate(node.left);
			const right = evaluate(node.right);

			if (!left.static || !right.static) return { value: undefined, static: false };
			let result;

			if ('id' in left) return { value: undefined, static: false };
			if ('id' in right) return { value: undefined, static: false };

			switch (node.operator) {
				case '==':
					result = left.value == right.value;
					break;
				case '!=':
					result = left.value != right.value;
					break;
				case '===':
					result = left.value === right.value;
					break;
				case '!==':
					result = left.value !== right.value;
					break;
				case '<':
					if (left.value == null || right.value == null) {
						result = false;
					} else result = left.value < right.value;
					break;
				case '<=':
					if (left.value == null || right.value == null) {
						result = false;
					} else result = left.value <= right.value;
					break;
				case '>':
					if (left.value == null || right.value == null) {
						result = false;
					} else result = left.value > right.value;
					break;
				case '>=':
					if (left.value == null || right.value == null) {
						result = false;
					} else result = left.value >= right.value;
					break;
				case 'in':
					try {
						// @ts-expect-error -- Error handled
						result = left.value in right.value;
					} catch {
						result = false;
					}
					break;
				case 'instanceof':
					try {
						// @ts-expect-error -- Error handled
						result = left.value instanceof right.value;
					} catch {
						result = false;
					}
					break;
				case '&&':
					result = left.value && right.value;
					break;
				case '||':
					result = left.value || right.value;
					break;
				case '??':
					result = left.value ?? right.value;
					break;
			}
			if (typeof result !== 'undefined')
				return { value: result, static: true, span: node.span };

			if (
				typeof left.value !== 'number' ||
				typeof left.value !== 'bigint' ||
				typeof right.value !== 'number' ||
				typeof right.value !== 'bigint' ||
				typeof left.value !== typeof right.value
			) {
				return { value: undefined, static: true, span: node.span };
			}

			switch (node.operator) {
				case '<<':
					result = left.value << right.value;
					break;
				case '>>':
					result = left.value >> right.value;
					break;
				case '>>>':
					result = left.value >>> right.value;
					break;
				case '+':
					result = left.value + right.value;
					break;
				case '-':
					result = left.value - right.value;
					break;
				case '*':
					result = left.value * right.value;
					break;
				case '/':
					result = left.value / right.value;
					break;
				case '%':
					result = left.value % right.value;
					break;
				case '**':
					result = left.value ** right.value;
					break;
				case '|':
					result = left.value | right.value;
					break;
				case '^':
					result = left.value ^ right.value;
					break;
				case '&':
					result = left.value & right.value;
					break;
				default:
					throw new Error('Unknown binary operator');
			}

			break;
		}

		case 'JSXElement':
		case 'JSXFragment':
		case 'JSXEmptyExpression':
		case 'JSXMemberExpression':
		case 'JSXNamespacedName':
		case 'JSXText':
			return { value: undefined, static: false };

		case 'TsAsExpression':
		case 'TsNonNullExpression':
		case 'TsConstAssertion':
		case 'TsTypeAssertion':
		case 'TsInstantiation':
			return evaluate(node.expression);

		case 'ParenthesisExpression':
			return evaluate(node.expression);

		case 'UnaryExpression': {
			const result = evaluate(node.argument);
			if (!result.static || 'id' in result)
				return { value: undefined, static: false };
			if (result.value == null)
				return { value: undefined, static: true, span: node.span };

			switch (node.operator) {
				case '+':
					try {
						// @ts-expect-error -- Error handled
						return { value: +result.value, static: true, span: node.span };
					} catch {
						return { value: undefined, static: true, span: node.span };
					}
				case '-':
					return { value: -result.value, static: true, span: node.span };
				case '!':
					return { value: !result.value, static: true, span: node.span };
				case '~':
					return { value: ~result.value, static: true, span: node.span };
				case 'typeof':
					return { value: typeof result.value, static: true, span: node.span };
				case 'void':
					return { value: undefined, static: true, span: node.span };
				case 'delete':
					return { value: undefined, static: false };
				default:
					throw new Error('Unknown unary operator');
			}
		}

		case 'AssignmentExpression':
			return evaluate(node.right);

		case 'ThisExpression':
			return { value: undefined, static: false };

		case 'ConditionalExpression': {
			const test = evaluate(node.test);
			if (!test.static || 'id' in test) return { value: undefined, static: false };

			if (test.value) {
				return evaluate(node.consequent);
			} else {
				return evaluate(node.alternate);
			}
		}

		case 'SuperPropExpression':
			return { value: undefined, static: false };

		case 'TaggedTemplateExpression':
			return { value: undefined, static: false };

		case 'TemplateLiteral': {
			const values = [];
			let quasisIndex = 0;
			let expressionsIndex = 0;
			let currentQuasi = true;
			while (
				currentQuasi
					? quasisIndex < node.quasis.length
					: expressionsIndex < node.expressions.length
			) {
				if (currentQuasi) {
					const result = evaluate(node.quasis[quasisIndex]);
					if (!result.static || 'id' in result)
						return { value: undefined, static: false };
					values.push(result.value);
					++quasisIndex;
				} else {
					const result = evaluate(node.expressions[expressionsIndex]);
					if (!result.static || 'id' in result)
						return { value: undefined, static: false };
					values.push(result.value);
					++expressionsIndex;
				}
				currentQuasi = !currentQuasi;
			}

			return { value: values.join(''), static: true, span: node.span };
		}

		case 'TemplateElement':
			return { value: node.raw, static: true, span: node.span };

		case 'NewExpression':
			return { value: undefined, static: false };

		case 'ClassExpression':
			return { value: undefined, static: false };

		case 'CallExpression': {
			// TODO: Make this condition more robust with import tracking
			if (
				node.callee.type === 'MemberExpression' &&
				node.callee.object.type === 'Identifier' &&
				node.callee.object.value === 'stylex' &&
				node.callee.property.type === 'Identifier' &&
				node.callee.property.value === 'firstThatWorks'
			) {
				return evaluate({
					type: 'ArrayExpression',
					span: node.span,
					elements: node.arguments.reverse(),
				});
			}

			return { value: undefined, static: false };
		}

		case 'Computed': {
			return evaluate(node.expression);
		}

		case 'MemberExpression': {
			const object = evaluate(node.object);
			if (!object.static) return { value: undefined, static: false };
			const property = evaluate(node.property);
			if (!property.static) return { value: undefined, static: false };

			const propertyKey = 'id' in property ? property.id : property.value;

			return {
				value:
					'id' in object
						? `${object.id}.${propertyKey}`
						: object.value == null
						? object.value
						: /* prettier-ignore */ typeof propertyKey === 'string'
						? // @ts-expect-error -- Ignore member expression strict rules
							object.value[propertyKey]
						: undefined,
				static: true,
				span: node.span,
			};
		}

		case 'OptionalChainingExpression':
			return { value: undefined, static: false };

		case 'UpdateExpression':
			return { value: undefined, static: false };

		case 'YieldExpression':
			return { value: undefined, static: false };

		case 'MetaProperty':
			return { value: undefined, static: false };

		case 'PrivateName':
			return evaluate(node.id);

		case 'SequenceExpression':
			return evaluate(node.expressions[node.expressions.length - 1]);

		default:
			throw new Error('Unknown expression');
	}

	return { value: undefined, static: false };
}
