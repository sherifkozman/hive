# Testing & Documentation Requirements

General (language-agnostic) requirements. Language-specific build/test commands and quality checklists live in the Python and Node minis; the evaluation harness is covered in the evaluation minis.

## Testing Requirements

Comprehensive testing should cover:

- **Functional testing:** verify correct execution with valid/invalid inputs.
- **Integration testing:** test interaction with external systems.
- **Security testing:** validate auth, input sanitization, rate limiting.
- **Performance testing:** check behavior under load, timeouts.
- **Error handling:** ensure proper error reporting and cleanup.

## Documentation Requirements

- Provide clear documentation of all tools and capabilities.
- Include working examples (**at least 3 per major feature**).
- Document security considerations.
- Specify required permissions and access levels.
- Document rate limits and performance characteristics.
