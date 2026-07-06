import { describe, expect, it } from 'vitest';
import {
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  renderPointerBlock,
  renderPointerDiff,
  upsertManagedBlock,
} from '../src/core/pointer.js';

describe('renderPointerBlock', () => {
  it('wraps 2-4 content lines with the start/end markers and mentions the payload dir', () => {
    const block = renderPointerBlock('/home/user/.gemini/hive-skills');
    const lines = block.split('\n');
    expect(lines[0]).toBe(MANAGED_BLOCK_START);
    expect(lines[lines.length - 1]).toBe(MANAGED_BLOCK_END);
    const contentLines = lines.slice(1, -1);
    expect(contentLines.length).toBeGreaterThanOrEqual(2);
    expect(contentLines.length).toBeLessThanOrEqual(4);
    expect(block).toContain('/home/user/.gemini/hive-skills');
    expect(block).toContain('composable/INDEX.md');
    expect(block).toContain('coverage rule');
  });

  it('does not enumerate specific skill names (content is stable across skill-set changes)', () => {
    const block = renderPointerBlock('/payload');
    expect(block).not.toContain('hive-code-review');
    expect(block).not.toContain('hive-claude-api');
  });
});

describe('upsertManagedBlock', () => {
  const block = renderPointerBlock('/payload/hive-skills');

  it('absent: appends at EOF with a blank-line separator, for non-empty content without a trailing newline', () => {
    const result = upsertManagedBlock('existing content', block);
    expect(result).toBe(`existing content\n\n${block}\n`);
  });

  it('absent: appends cleanly for an empty file (no leading blank lines)', () => {
    const result = upsertManagedBlock('', block);
    expect(result).toBe(`${block}\n`);
  });

  it('absent: normalizes existing trailing whitespace/newlines to exactly one blank line before the block', () => {
    const result = upsertManagedBlock('line1\n\n\n', block);
    expect(result).toBe(`line1\n\n${block}\n`);
  });

  it('present-identical: replacing with the same block is a no-op (idempotent)', () => {
    const once = upsertManagedBlock('before\n', block);
    const twice = upsertManagedBlock(once, block);
    expect(twice).toBe(once);
  });

  it('present-stale: replaces an old block with the new one in place, preserving surrounding content', () => {
    const staleBlock = [MANAGED_BLOCK_START, 'old payload path: /old/path', MANAGED_BLOCK_END].join('\n');
    const fileContent = `# my rules\n\n${staleBlock}\n\nsome trailing user content\n`;
    const result = upsertManagedBlock(fileContent, block);

    expect(result).toContain('# my rules');
    expect(result).toContain('some trailing user content');
    expect(result).not.toContain('/old/path');
    expect(result).toContain(block);
  });

  it('is idempotent across repeated applications with the same block, regardless of starting shape', () => {
    for (const initial of ['', 'no newline at all', 'has one\n', 'has many\n\n\n\n']) {
      const once = upsertManagedBlock(initial, block);
      const twice = upsertManagedBlock(once, block);
      expect(twice).toBe(once);
    }
  });

  it('replaces in place even when the end marker sits at EOF with no trailing newline', () => {
    const fileContent = `before\n${block}`; // no trailing newline after the end marker
    const result = upsertManagedBlock(fileContent, block);
    expect(result).toBe(`before\n${block}\n`);
    // Re-applying must be a true no-op from here on.
    expect(upsertManagedBlock(result, block)).toBe(result);
  });

  it('preserves content that comes after the end marker on the same restore pass', () => {
    const fileContent = `${block}\nafter-marker-line\n`;
    const result = upsertManagedBlock(fileContent, block);
    expect(result).toBe(fileContent);
  });
});

describe('renderPointerDiff', () => {
  it('describes file creation when the file does not exist yet', () => {
    const diff = renderPointerDiff(undefined, 'new content', '/path/to/file.md');
    expect(diff).toContain('/path/to/file.md');
    expect(diff).toContain('does not exist yet');
    expect(diff).toContain('new content');
  });

  it('shows current vs proposed content when the file already exists', () => {
    const diff = renderPointerDiff('old content', 'new content', '/path/to/file.md');
    expect(diff).toContain('old content');
    expect(diff).toContain('new content');
    expect(diff).toContain('/path/to/file.md');
  });
});
