import Ajv, { type Schema } from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'yaml';

type Component =
  | { type: 'text'; props: { text: string; markdown?: boolean } }
  | { type: 'buttons'; props: { buttons: { text: string; action: { type: string } }[] } };

type Node = {
  id: string;
  end?: boolean;
  components?: Component[];
  text?: string;
  buttons?: { text: string; action: { type: string } }[];
};

type FlowEdge = {
  from: string;
  to: string;
  when?: string;
};

type Config = {
  schema_version?: string;
  initialNodeId?: string;
  nodes: Node[];
  flow: FlowEdge[];
};

type CanonicalConfig = {
  schema_version?: string;
  initialNodeId?: string;
  nodes: Node[];
  flow: FlowEdge[];
};

const buttonSchema: Schema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    action: {
      type: 'object',
      properties: {
        type: { type: 'string' },
      },
      required: ['type'],
      additionalProperties: true,
    },
  },
  required: ['text', 'action'],
  additionalProperties: false,
};

const textComponentSchema: Schema = {
  type: 'object',
  properties: {
    type: { const: 'text' },
    props: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        markdown: { type: 'boolean', nullable: true },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  required: ['type', 'props'],
  additionalProperties: false,
};

const buttonsComponentSchema: Schema = {
  type: 'object',
  properties: {
    type: { const: 'buttons' },
    props: {
      type: 'object',
      properties: {
        buttons: {
          type: 'array',
          items: buttonSchema,
        },
      },
      required: ['buttons'],
      additionalProperties: false,
    },
  },
  required: ['type', 'props'],
  additionalProperties: false,
};

const componentSchema: Schema = {
  anyOf: [textComponentSchema, buttonsComponentSchema],
};

const nodeSchema: Schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    end: { type: 'boolean', nullable: true },
    components: {
      type: 'array',
      nullable: true,
      items: componentSchema,
    },
    text: { type: 'string', nullable: true },
    buttons: {
      type: 'array',
      nullable: true,
      items: buttonSchema,
    },
  },
  required: ['id'],
  additionalProperties: false,
};

const flowSchema: Schema = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    when: { type: 'string', nullable: true },
  },
  required: ['from', 'to'],
  additionalProperties: false,
};

const configSchema: Schema = {
  type: 'object',
  properties: {
    schema_version: { type: 'string', nullable: true },
    initialNodeId: { type: 'string', nullable: true },
    nodes: { type: 'array', items: nodeSchema },
    flow: { type: 'array', items: flowSchema },
  },
  required: ['nodes', 'flow'],
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const validateConfig = ajv.compile<Config>(configSchema as Schema);

export function compileYamlToCanonicalJson(source: string): CanonicalConfig {
  const doc = yaml.parse(source) as Config;
  if (!validateConfig(doc)) {
    const messages = validateConfig.errors
      ?.map((err) => `${err.instancePath} ${err.message}`)
      .join('; ');
    throw new Error(`Config validation failed: ${messages}`);
  }

  const nodes = doc.nodes.map((node) => {
    if (!node.components) {
      const components: Component[] = [];
      if (node.text) {
        components.push({ type: 'text', props: { text: node.text } });
      }
      if (node.buttons) {
        components.push({
          type: 'buttons',
          props: { buttons: node.buttons },
        });
      }
      return { ...node, components };
    }
    return node;
  });

  return {
    schema_version: doc.schema_version,
    initialNodeId: doc.initialNodeId,
    nodes,
    flow: doc.flow,
  };
}
