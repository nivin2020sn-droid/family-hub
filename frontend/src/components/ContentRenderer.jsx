// Renders a long admin-edited text as a block of paragraphs / bullet
// sections. The DB stores plain text (no Markdown) — we detect simple
// patterns and format them so the admin can write naturally:
//
//   • A line that ends WITHOUT a period and is followed by bullets or
//     another paragraph is rendered as an <h2> section heading.
//   • Lines starting with "- " are grouped into a <ul> list.
//   • Blank lines separate blocks.
//
// This keeps the editor experience zero-friction (plain text in admin →
// formatted output on the public page) without pulling in a Markdown lib.

import React from "react";

function isBulletLine(line) {
  return /^\s*-\s+/.test(line);
}

function looksLikeHeading(blockLines, nextBlock) {
  if (blockLines.length !== 1) return false;
  const line = blockLines[0].trim();
  if (!line) return false;
  if (line.length > 80) return false;
  if (line.endsWith(".") || line.endsWith("!") || line.endsWith("?")) return false;
  // Heading-y if the next block exists (so it's introducing content).
  return Boolean(nextBlock && nextBlock.length);
}

function splitBlocks(text) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let cur = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

const renderInline = (text) => {
  // Auto-link bare email addresses so the admin doesn't have to.
  const parts = text.split(/(\S+@\S+\.\S+)/g);
  return parts.map((p, i) =>
    /\S+@\S+\.\S+/.test(p) ? (
      <a
        key={i}
        href={`mailto:${p}`}
        className="text-[#E11D48] hover:underline font-medium"
      >
        {p}
      </a>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
};

const ContentRenderer = ({ text }) => {
  const blocks = splitBlocks(text);
  const nodes = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (looksLikeHeading(block, next)) {
      nodes.push(
        <h2
          key={i}
          className="font-heading text-lg sm:text-xl font-semibold text-[#2D2A26] dark:text-white mt-6 first:mt-0 mb-2"
        >
          {block[0]}
        </h2>,
      );
      continue;
    }
    if (block.every(isBulletLine)) {
      nodes.push(
        <ul
          key={i}
          className="list-disc ps-5 space-y-1.5 marker:text-[#E11D48] mt-3"
        >
          {block.map((b, j) => (
            <li key={j}>{renderInline(b.replace(/^\s*-\s+/, ""))}</li>
          ))}
        </ul>,
      );
      continue;
    }
    // Plain paragraph — preserve hard line-breaks inside the block.
    nodes.push(
      <p key={i} className="leading-relaxed mt-3 whitespace-pre-line">
        {renderInline(block.join("\n"))}
      </p>,
    );
  }
  return <>{nodes}</>;
};

export default ContentRenderer;
