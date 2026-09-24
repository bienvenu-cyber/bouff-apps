import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionSetNode,
  ValueNode,
} from 'graphql';

type Fragments = Record<string, FragmentDefinitionNode>;

export function operationOf(doc: DocumentNode) {
  const op = doc.definitions.find(
    (d) => d.kind === 'OperationDefinition'
  ) as OperationDefinitionNode;
  const fragments: Fragments = {};
  for (const d of doc.definitions) {
    if (d.kind === 'FragmentDefinition') fragments[d.name.value] = d;
  }
  return { op, fragments };
}

export function valueOf(node: ValueNode, vars: Record<string, any>): any {
  switch (node.kind) {
    case 'Variable':
      return vars[node.name.value];
    case 'IntValue':
      return parseInt(node.value, 10);
    case 'FloatValue':
      return parseFloat(node.value);
    case 'StringValue':
    case 'EnumValue':
      return node.value;
    case 'BooleanValue':
      return node.value;
    case 'NullValue':
      return null;
    case 'ListValue':
      return node.values.map((v) => valueOf(v, vars));
    case 'ObjectValue':
      return Object.fromEntries(
        node.fields.map((f) => [f.name.value, valueOf(f.value, vars)])
      );
  }
}

export function argsOf(field: FieldNode, vars: Record<string, any>) {
  return Object.fromEntries(
    (field.arguments ?? []).map((a) => [a.name.value, valueOf(a.value, vars)])
  );
}

function fieldsOf(set: SelectionSetNode, fragments: Fragments): FieldNode[] {
  const out: FieldNode[] = [];
  for (const s of set.selections) {
    if (s.kind === 'Field') out.push(s);
    else if (s.kind === 'InlineFragment') out.push(...fieldsOf(s.selectionSet, fragments));
    else if (s.kind === 'FragmentSpread') {
      const f = fragments[s.name.value];
      if (f) out.push(...fieldsOf(f.selectionSet, fragments));
    }
  }
  return out;
}

/**
 * Découpe la réponse pour qu'elle corresponde exactement aux champs demandés :
 * les champs absents deviennent null, ce qui évite les écrans vides d'Apollo.
 */
export function project(
  value: any,
  set: SelectionSetNode | undefined,
  fragments: Fragments,
  typename = 'Object'
): any {
  if (value === undefined || value === null) return null;
  if (!set) return value;
  if (Array.isArray(value)) return value.map((v) => project(v, set, fragments, typename));
  if (typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const f of fieldsOf(set, fragments)) {
    const key = f.alias?.value ?? f.name.value;
    const name = f.name.value;
    if (name === '__typename') {
      out[key] = value.__typename ?? typename;
      continue;
    }
    const raw = value[name];
    if (f.selectionSet) {
      const childType =
        (Array.isArray(raw) ? raw[0]?.__typename : raw?.__typename) ??
        name.charAt(0).toUpperCase() + name.slice(1);
      out[key] = project(raw, f.selectionSet, fragments, childType);
    } else {
      out[key] = raw === undefined ? null : raw;
    }
  }
  return out;
}
