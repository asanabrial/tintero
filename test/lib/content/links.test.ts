import { describe, it, expect } from "bun:test";
import {
  extractWikilinks,
  extractInternalHrefs,
  resolveHref,
  buildLinkGraph,
  publicGraph,
  backlinks,
  buildWikiResolver,
  toGraphView,
  localGraph,
  unlinkedMentions,
  type GraphInputNode,
} from "../../../src/lib/content/links";

// ============================================================
// extractWikilinks
// ============================================================

describe("extractWikilinks", () => {
  it("returns empty for a body with no wikilinks", () => {
    expect(extractWikilinks("plain text, [a link](/blog/x)")).toEqual([]);
  });

  it("extracts a plain [[Target]]", () => {
    expect(extractWikilinks("see [[Patterns]] now")).toEqual([
      { target: "Patterns" },
    ]);
  });

  it("extracts an aliased [[Target|Alias]]", () => {
    expect(extractWikilinks("see [[patterns-ts|the patterns post]]")).toEqual([
      { target: "patterns-ts", alias: "the patterns post" },
    ]);
  });

  it("strips a #heading anchor from the target", () => {
    expect(extractWikilinks("[[Guide#Setup]]")).toEqual([{ target: "Guide" }]);
    expect(extractWikilinks("[[Guide#Setup|jump]]")).toEqual([
      { target: "Guide", alias: "jump" },
    ]);
  });

  it("treats an ![[embed]] as a reference too", () => {
    expect(extractWikilinks("![[Other Note]]")).toEqual([
      { target: "Other Note" },
    ]);
  });

  it("extracts multiple wikilinks and trims whitespace", () => {
    expect(extractWikilinks("[[ A ]] and [[B|b]]")).toEqual([
      { target: "A" },
      { target: "B", alias: "b" },
    ]);
  });
});

// ============================================================
// extractInternalHrefs / resolveHref
// ============================================================

describe("extractInternalHrefs", () => {
  it("keeps internal /blog and /pages links, drops external and anchors", () => {
    const body =
      "[a](/blog/foo) [b](/pages/bar) [c](https://x.com) [d](#frag) [e](mailto:x@y.z)";
    expect(extractInternalHrefs(body)).toEqual(["/blog/foo", "/pages/bar"]);
  });

  it("ignores image links and returns hrefs with query/hash intact", () => {
    expect(extractInternalHrefs("![img](/uploads/a.png) [x](/blog/y?z=1#h)")).toEqual([
      "/blog/y?z=1#h",
    ]);
  });
});

describe("resolveHref", () => {
  it("maps /blog/<slug> to a post and /pages/<slug> to a page", () => {
    expect(resolveHref("/blog/foo")).toEqual({ type: "post", slug: "foo" });
    expect(resolveHref("/pages/bar")).toEqual({ type: "page", slug: "bar" });
  });

  it("strips query and hash", () => {
    expect(resolveHref("/blog/foo?a=1#h")).toEqual({ type: "post", slug: "foo" });
  });

  it("returns null for non-content hrefs", () => {
    expect(resolveHref("/admin/x")).toBeNull();
    expect(resolveHref("https://x.com/blog/y")).toBeNull();
  });
});

// ============================================================
// buildLinkGraph
// ============================================================

const node = (
  over: Partial<GraphInputNode> & Pick<GraphInputNode, "slug" | "title" | "body">
): GraphInputNode => ({
  type: "post",
  published: true,
  public: true,
  ...over,
});

describe("buildLinkGraph", () => {
  it("creates one node per input with correct id and url", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "" }),
      node({ type: "page", slug: "b", title: "B", body: "" }),
    ]);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["page:b", "post:a"]);
    expect(g.nodes.find((n) => n.id === "post:a")!.url).toBe("/blog/a");
    expect(g.nodes.find((n) => n.id === "page:b")!.url).toBe("/pages/b");
  });

  it("resolves a wikilink by title (case-insensitive)", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "Alpha", body: "link to [[beta]]" }),
      node({ slug: "b", title: "Beta", body: "" }),
    ]);
    expect(g.edges).toEqual([{ from: "post:a", to: "post:b", kind: "wikilink" }]);
    expect(g.broken).toEqual([]);
  });

  it("resolves a wikilink by slug", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "Alpha", body: "[[b]]" }),
      node({ slug: "b", title: "Beta", body: "" }),
    ]);
    expect(g.edges).toEqual([{ from: "post:a", to: "post:b", kind: "wikilink" }]);
  });

  it("resolves an internal markdown link into an edge", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "see [b](/blog/b)" }),
      node({ slug: "b", title: "B", body: "" }),
    ]);
    expect(g.edges).toEqual([{ from: "post:a", to: "post:b", kind: "link" }]);
  });

  it("records unresolved wikilinks as broken links, not edges", () => {
    const g = buildLinkGraph([node({ slug: "a", title: "A", body: "[[Ghost]]" })]);
    expect(g.edges).toEqual([]);
    expect(g.broken).toEqual([{ from: "post:a", target: "Ghost" }]);
  });

  it("dedupes repeated edges between the same pair", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[b]] [[Beta]] [b](/blog/b)" }),
      node({ slug: "b", title: "Beta", body: "" }),
    ]);
    expect(g.edges).toEqual([{ from: "post:a", to: "post:b", kind: "wikilink" }]);
  });

  it("excludes self-links", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "Alpha", body: "[[Alpha]] [self](/blog/a)" }),
    ]);
    expect(g.edges).toEqual([]);
    expect(g.broken).toEqual([]);
  });

  it("computes in/out degrees", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[b]] [[c]]" }),
      node({ slug: "b", title: "B", body: "[[c]]" }),
      node({ slug: "c", title: "C", body: "" }),
    ]);
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId["post:a"].outDegree).toBe(2);
    expect(byId["post:a"].inDegree).toBe(0);
    expect(byId["post:c"].inDegree).toBe(2);
    expect(byId["post:c"].outDegree).toBe(0);
  });
});

// ============================================================
// publicGraph
// ============================================================

describe("publicGraph", () => {
  it("drops draft/private nodes and any edge touching them", () => {
    const full = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[b]] [[c]]" }),
      node({ slug: "b", title: "B", body: "", published: false }), // draft
      node({ slug: "c", title: "C", body: "", public: false }), // private
      node({ slug: "d", title: "D", body: "[[a]]" }),
    ]);
    const pub = publicGraph(full);
    expect(pub.nodes.map((n) => n.id).sort()).toEqual(["post:a", "post:d"]);
    // a→b and a→c dropped (b draft, c private); d→a kept
    expect(pub.edges).toEqual([{ from: "post:d", to: "post:a", kind: "wikilink" }]);
  });

  it("drops broken links from excluded source nodes", () => {
    const full = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[Ghost]]", published: false }),
    ]);
    expect(publicGraph(full).broken).toEqual([]);
  });
});

// ============================================================
// backlinks
// ============================================================

describe("backlinks", () => {
  it("returns the nodes that link TO the given id", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[c]]" }),
      node({ slug: "b", title: "B", body: "[[c]]" }),
      node({ slug: "c", title: "C", body: "" }),
    ]);
    const back = backlinks("post:c", g).map((n) => n.id).sort();
    expect(back).toEqual(["post:a", "post:b"]);
  });

  it("returns an empty array when nothing links in", () => {
    const g = buildLinkGraph([node({ slug: "a", title: "A", body: "" })]);
    expect(backlinks("post:a", g)).toEqual([]);
  });
});

// ============================================================
// buildWikiResolver
// ============================================================

describe("buildWikiResolver", () => {
  const resolve = buildWikiResolver([
    { type: "post", slug: "patterns-ts", title: "Advanced Patterns" },
    { type: "page", slug: "about", title: "About Me" },
  ]);

  it("resolves by title (case-insensitive) to the content URL", () => {
    expect(resolve("advanced patterns")).toEqual({ url: "/blog/patterns-ts" });
    expect(resolve("About Me")).toEqual({ url: "/pages/about" });
  });

  it("resolves by slug", () => {
    expect(resolve("patterns-ts")).toEqual({ url: "/blog/patterns-ts" });
    expect(resolve("about")).toEqual({ url: "/pages/about" });
  });

  it("returns null for an unknown target", () => {
    expect(resolve("Ghost Note")).toBeNull();
  });
});

// ============================================================
// toGraphView
// ============================================================

// ============================================================
// localGraph
// ============================================================

describe("localGraph", () => {
  // a → b → c → d, plus e isolated. Center on b.
  const full = buildLinkGraph([
    node({ slug: "a", title: "A", body: "[[b]]" }),
    node({ slug: "b", title: "B", body: "[[c]]" }),
    node({ slug: "c", title: "C", body: "[[d]]" }),
    node({ slug: "d", title: "D", body: "" }),
    node({ slug: "e", title: "E", body: "" }),
  ]);

  it("keeps the focus node and its direct (depth 1) neighbors, undirected", () => {
    const g = localGraph("post:b", full, 1);
    // b's neighbors: a (links in) and c (links out).
    expect(g.nodes.map((n) => n.id).sort()).toEqual([
      "post:a",
      "post:b",
      "post:c",
    ]);
    // Only edges whose both endpoints survive.
    expect(g.edges).toEqual([
      { from: "post:a", to: "post:b", kind: "wikilink" },
      { from: "post:b", to: "post:c", kind: "wikilink" },
    ]);
  });

  it("expands to depth 2 neighbors", () => {
    const g = localGraph("post:b", full, 2);
    expect(g.nodes.map((n) => n.id).sort()).toEqual([
      "post:a",
      "post:b",
      "post:c",
      "post:d",
    ]);
  });

  it("returns just the focus node when it has no links", () => {
    const g = localGraph("post:e", full, 1);
    expect(g.nodes.map((n) => n.id)).toEqual(["post:e"]);
    expect(g.edges).toEqual([]);
  });

  it("returns an empty graph for an unknown id", () => {
    const g = localGraph("post:zzz", full, 1);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});

// ============================================================
// unlinkedMentions
// ============================================================

describe("unlinkedMentions", () => {
  it("finds notes that name the target's title in prose but don't link it", () => {
    const input = [
      node({ slug: "ts", title: "TypeScript", body: "" }),
      node({ slug: "a", title: "A", body: "I love TypeScript a lot." }),
      node({ slug: "b", title: "B", body: "See [[TypeScript]] for more." }),
      node({ slug: "c", title: "C", body: "Nothing relevant here." }),
    ];
    const mentions = unlinkedMentions("post:ts", input);
    // a mentions it in prose (unlinked); b links it (excluded); c doesn't mention.
    expect(mentions.map((m) => m.id)).toEqual(["post:a"]);
    expect(mentions[0].title).toBe("A");
    expect(mentions[0].url).toBe("/blog/a");
  });

  it("matches case-insensitively on whole-word boundaries", () => {
    const input = [
      node({ slug: "go", title: "Go", body: "" }),
      node({ slug: "a", title: "A", body: "Let's GO build something." }),
      node({ slug: "b", title: "B", body: "The argot is niche." }), // 'go' inside 'argot' must not match
    ];
    const mentions = unlinkedMentions("post:go", input);
    expect(mentions.map((m) => m.id)).toEqual(["post:a"]);
  });

  it("ignores the target itself and counts occurrences", () => {
    const input = [
      node({ slug: "ts", title: "TypeScript", body: "TypeScript is me." }),
      node({ slug: "a", title: "A", body: "TypeScript here, TypeScript there." }),
    ];
    const mentions = unlinkedMentions("post:ts", input);
    expect(mentions.map((m) => m.id)).toEqual(["post:a"]);
    expect(mentions[0].count).toBe(2);
  });

  it("does not count a mention that sits inside a markdown link to the target", () => {
    const input = [
      node({ slug: "ts", title: "TypeScript", body: "" }),
      node({ slug: "a", title: "A", body: "Read [TypeScript](/blog/ts) now." }),
    ];
    expect(unlinkedMentions("post:ts", input)).toEqual([]);
  });
});

describe("toGraphView", () => {
  it("projects nodes (with combined degree) and links into the client shape", () => {
    const g = buildLinkGraph([
      node({ slug: "a", title: "A", body: "[[b]]" }),
      node({ slug: "b", title: "B", body: "[[a]]" }),
    ]);
    const view = toGraphView(g);
    expect(view.links).toEqual([
      { source: "post:a", target: "post:b" },
      { source: "post:b", target: "post:a" },
    ]);
    const a = view.nodes.find((n) => n.id === "post:a")!;
    expect(a).toEqual({
      id: "post:a",
      title: "A",
      url: "/blog/a",
      type: "post",
      degree: 2, // 1 in + 1 out
    });
  });
});
