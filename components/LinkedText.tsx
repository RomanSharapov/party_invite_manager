import { Fragment } from "react";

export function LinkedText({ text }: { text: string }) {
  return text.split(/(\b(?:https?:\/\/|www\.)[^\s<>"']+)/gi).map((part, index) => {
    if (index % 2 === 0) return part;

    let url = part.replace(/[.,!?;:]+$/, "");
    // Keep balanced parentheses in URLs, but exclude surrounding punctuation.
    while (url.endsWith(")") && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    }
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    try {
      new URL(href);
    } catch {
      return part;
    }

    return (
      <Fragment key={index}>
        <a href={href} target="_blank" rel="noopener noreferrer" className="guest-note-link">
          {url}
        </a>
        {part.slice(url.length)}
      </Fragment>
    );
  });
}
