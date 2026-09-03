---
name: OpenAPI numeric compatibility
description: A code generation compatibility constraint for API specs in this workspace.
---

Use `number` for integer-like API fields when the generated Zod package is on the workspace's Zod 3 runtime; OpenAPI integer formats can generate `z.int()`, which is unavailable there.

**Why:** Code generation succeeds but the shared library typecheck fails if those generated schemas call APIs from a newer Zod major than the installed runtime.

**How to apply:** When adding numeric request or response fields to `lib/api-spec/openapi.yaml`, prefer `type: number` unless the workspace Zod version and generator output have been upgraded together.