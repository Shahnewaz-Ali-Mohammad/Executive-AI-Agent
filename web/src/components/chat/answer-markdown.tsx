"use client";

/**
 * Renders an assistant answer (Markdown) with citations turned into
 * clickable tabs. Works while the answer is still streaming: citations are
 * resolved against the workspace's documents on every render.
 */
import { memo, useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CITATION_HREF_PREFIX,
  extractCitations,
  linkifyCitations,
  parseCitationHref,
  type CitableDocument,
  type Citation,
} from "@/lib/citations";
import { CitationTab } from "./citation-tab";

interface AnswerMarkdownProps {
  content: string;
  /** Citations from the server, once the answer is complete. */
  citations?: Citation[];
  /** Used to resolve citations while the answer is still streaming. */
  documents: CitableDocument[];
  onOpenCitation: (documentId: string, page: number) => void;
}

/** Keep our "#cite:" links; sanitise everything else as usual. */
function urlTransform(url: string): string {
  return url.startsWith(CITATION_HREF_PREFIX) ? url : defaultUrlTransform(url);
}

export const AnswerMarkdown = memo(function AnswerMarkdown({
  content,
  citations,
  documents,
  onOpenCitation,
}: AnswerMarkdownProps) {
  const resolved = useMemo(
    () => (citations && citations.length > 0 ? citations : extractCitations(content, documents)),
    [citations, content, documents],
  );
  const markdown = useMemo(() => linkifyCitations(content, resolved), [content, resolved]);

  const components = useMemo<Components>(
    () => ({
      a({ href = "", children }) {
        const index = parseCitationHref(href);
        const citation = index === null ? undefined : resolved[index];
        if (citation) {
          const { documentId, page } = citation;
          return (
            <CitationTab
              fileName={citation.fileName}
              page={page}
              resolved={documentId !== null}
              onOpen={documentId ? () => onOpenCitation(documentId, page) : undefined}
            />
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" className="text-ledger underline underline-offset-2">
            {children}
          </a>
        );
      },
    }),
    [resolved, onOpenCitation],
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
      {markdown}
    </ReactMarkdown>
  );
});
