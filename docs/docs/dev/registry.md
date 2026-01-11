# Component Registry

Registry entry shape
- { id: string, version: string, propsSchema?, events?, capabilities? }
- propsSchema/events payloadSchema: JSON Schema subsets
- capabilities: allowlist for built-in affordances (e.g., clipboard, fileUpload)

Runtime behavior
- Current runtime registers renderers by `component.type` and renders a “missing renderer” placeholder (with a warning) when no renderer is registered.
- Stricter enforcement (e.g. `missing_component`, contract/version auditing, unknown-events policies) is not yet implemented end-to-end in the current stack.


