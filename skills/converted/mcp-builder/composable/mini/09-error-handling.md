# Error Handling Standards

General, cross-language error-handling standards. Language-specific error formatting (`_handle_api_error` in Python, `handleApiError` in Node, mapping 404/403/429/timeout to messages) lives in the language minis.

## Principles

- Use standard **JSON-RPC error codes**.
- **Report tool errors within result objects** (not protocol-level errors).
- Provide **helpful, specific error messages with suggested next steps**.
- **Don't expose internal implementation details.**
- **Clean up resources properly on errors.**

Error messages should be clear, actionable, and educational — guiding the agent toward a solution with specific suggestions and next steps.

## Example (TypeScript pattern)

```typescript
try {
  const result = performOperation();
  return { content: [{ type: "text", text: result }] };
} catch (error) {
  return {
    isError: true,
    content: [{
      type: "text",
      text: `Error: ${error.message}. Try using filter='active_only' to reduce results.`
    }]
  };
}
```

Note how the message not only reports the failure but suggests a concrete next step (`filter='active_only'`) that helps the agent recover.
