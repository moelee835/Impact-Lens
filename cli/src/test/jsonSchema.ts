// A small JSON Schema 2020-12 checker covering exactly the keywords `cli/schemas/response.schema.json`
// uses. It exists so the schema can be enforced without adding a validator dependency: this repository
// keeps four devDependencies total and CI installs with `pnpm --frozen-lockfile` on three operating
// systems, so a new package costs lockfile coordination that buys no extra drift detection here (see
// docs/work/task-m1-contract-types.md, decision 5).
//
// The obvious risk of a hand-written checker is that it silently accepts what it does not understand.
// Two guards answer that. `assertSupportedKeywords` walks the schema and fails on any keyword this file
// does not implement, so extending the schema with an unsupported keyword breaks the build instead of
// weakening the check. And `cli/src/test/schema.test.ts` feeds it envelopes the schema forbids and
// requires each one to be rejected.

export type JsonSchema = Record<string, unknown> | boolean;

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', 'title', '$defs', '$ref',
  'type', 'const', 'enum',
  'properties', 'required', 'additionalProperties',
  'items', 'minItems', 'maxItems',
  'minimum',
  'allOf', 'anyOf', 'oneOf', 'not',
  'if', 'then', 'else',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Fails on any keyword the checker below does not implement, so the schema cannot outgrow it unnoticed. */
export function assertSupportedKeywords(schema: JsonSchema, path = '#'): void {
  if (typeof schema === 'boolean' || !isPlainObject(schema)) {
    return;
  }
  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`${path}: unsupported JSON Schema keyword "${keyword}"`);
    }
    if (['$defs', 'properties'].includes(keyword) && isPlainObject(value)) {
      for (const [name, child] of Object.entries(value)) {
        assertSupportedKeywords(child as JsonSchema, `${path}/${keyword}/${name}`);
      }
    } else if (['allOf', 'anyOf', 'oneOf'].includes(keyword) && Array.isArray(value)) {
      value.forEach((child, index) => assertSupportedKeywords(child as JsonSchema, `${path}/${keyword}/${index}`));
    } else if (['items', 'not', 'if', 'then', 'else', 'additionalProperties'].includes(keyword)) {
      assertSupportedKeywords(value as JsonSchema, `${path}/${keyword}`);
    }
  }
}

function resolve(reference: string, root: JsonSchema): JsonSchema {
  if (!reference.startsWith('#/')) {
    throw new Error(`unsupported $ref: ${reference}`);
  }
  let current: unknown = root;
  for (const segment of reference.slice(2).split('/')) {
    if (!isPlainObject(current)) {
      throw new Error(`unresolvable $ref: ${reference}`);
    }
    current = current[segment];
  }
  if (current === undefined) {
    throw new Error(`unresolvable $ref: ${reference}`);
  }
  return current as JsonSchema;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'object': return isPlainObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'null': return value === null;
    default: throw new Error(`unsupported type: ${type}`);
  }
}

/** Returns one message per violation. An empty array means the value satisfies the schema. */
export function validate(schema: JsonSchema, value: unknown, root: JsonSchema = schema, path = ''): string[] {
  if (typeof schema === 'boolean') {
    return schema ? [] : [`${path || '(root)'}: schema is false`];
  }
  const at = path || '(root)';
  const errors: string[] = [];

  if (typeof schema.$ref === 'string') {
    return validate(resolve(schema.$ref, root), value, root, path);
  }
  if (typeof schema.type === 'string' && !matchesType(schema.type, value)) {
    return [`${at}: expected type ${schema.type}, got ${Array.isArray(value) ? 'array' : typeof value}`];
  }
  if ('const' in schema && value !== schema.const) {
    errors.push(`${at}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${at}: ${value} is below minimum ${schema.minimum}`);
  }

  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(`${at}: missing required property "${String(key)}"`);
        }
      }
    }
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validate(child as JsonSchema, value[key], root, `${path}/${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${at}: additional property "${key}" is not allowed`);
        }
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(...validate(schema.additionalProperties as JsonSchema, value[key], root, `${path}/${key}`));
        }
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.items !== undefined) {
      value.forEach((element, index) => {
        errors.push(...validate(schema.items as JsonSchema, element, root, `${path}/${index}`));
      });
    }
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${at}: expected at least ${schema.minItems} items, got ${value.length}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${at}: expected at most ${schema.maxItems} items, got ${value.length}`);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) {
      errors.push(...validate(child as JsonSchema, value, root, path));
    }
  }
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(child => validate(child as JsonSchema, value, root, path).length === 0)) {
    errors.push(`${at}: does not match any anyOf branch`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter(child => validate(child as JsonSchema, value, root, path).length === 0).length;
    if (matched !== 1) {
      errors.push(`${at}: matched ${matched} oneOf branches, expected exactly 1`);
    }
  }
  if (schema.not !== undefined && validate(schema.not as JsonSchema, value, root, path).length === 0) {
    errors.push(`${at}: matched a "not" schema`);
  }
  if (schema.if !== undefined) {
    const branch = validate(schema.if as JsonSchema, value, root, path).length === 0 ? schema.then : schema.else;
    if (branch !== undefined) {
      errors.push(...validate(branch as JsonSchema, value, root, path));
    }
  }
  return errors;
}
