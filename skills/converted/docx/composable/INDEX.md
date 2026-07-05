# DOCX: Loading Menu

Create, read, edit, or manipulate Word documents (.docx). Creating a document: load setup-layout + creating-elements. Editing an existing one: load editing-existing + xml-reference.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `mini/00-core.md` - what a .docx is, quick-reference routing table, dependencies, vendored-script paths - **always load**
- `mini/01-reading-converting.md` - read/analyze content, convert .doc→.docx, render to images, accept tracked changes - Load when reading or converting.
- `mini/02-creating-setup-layout.md` - docx-js setup, validation, page size, styles - Load when creating a document.
- `mini/03-creating-elements.md` - lists, tables, images, hyperlinks, footnotes, tabs, columns, TOC, headers/footers, critical rules - Load when adding content.
- `mini/04-editing-existing.md` - unpack → edit XML → repack, comments, common pitfalls - Load when editing an existing .docx.
- `mini/05-xml-reference.md` - raw WordprocessingML: schema, tracked changes, comments, images - Load when hand-editing XML.
