# Response Formats (JSON vs Markdown)

All tools that return data should support **multiple formats**, typically via a `response_format` parameter that defaults to markdown. JSON is for programmatic processing; Markdown is for human readability.

## JSON format (`response_format="json"`)

- Machine-readable structured data
- Return complete, structured data suitable for programmatic processing
- Include all available fields and metadata
- Use consistent field names and types

## Markdown format (`response_format="markdown"`, typically the default)

- Human-readable formatted text
- Use headers, lists, and formatting for clarity
- Convert timestamps to human-readable format (e.g., "2024-01-15 10:30:00 UTC" instead of epoch)
- Show display names with IDs in parentheses (e.g., "@john.doe (U123456)")
- Omit verbose metadata (e.g., show only one profile image URL, not all sizes)
- Group related information logically

(Language-specific code for implementing the `ResponseFormat` enum and formatting both branches lives in the Python and Node minis.)
