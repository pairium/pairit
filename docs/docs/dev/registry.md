# Component Registry

Registry entry shape
- { id: string, version: string, propsSchema?, events?, capabilities? }
- propsSchema/events payloadSchema: JSON Schema subsets
- capabilities: allowlist for built-in affordances (e.g., clipboard, fileUpload)

Runtime behavior
- Frontend must error with missing_component when id not implemented
- Record resolved implementation version for audit
- unknownEvents policy defaults to error


