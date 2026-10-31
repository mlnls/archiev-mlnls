import { AUTHOR, absoluteUrl, postPath, SITE_DESCRIPTION, SITE_NAME, SITE_URL, tagPath } from "./site";
import { firstImage, plainText } from "./markdown";
import type { Post } from "./types";

const PERSON_ID = `${AUTHOR.url}#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const person = () => ({ "@type": "Person", "@id": PERSON_ID, name: AUTHOR.name, url: AUTHOR.url, sameAs: AUTHOR.sameAs });

const website = () => ({
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: "ko",
  author: { "@id": PERSON_ID },
});

export function siteGraph() {
  return { "@context": "https://schema.org", "@graph": [person(), website()] };
}

/**
 * 글 데이터에서 그대로 만듭니다. 화면에 보이는 값만 넣고, 없는 값은 만들어 넣지 않습니다.
 * Person은 mlnl.site의 @id와 같아서 두 사이트가 한 사람으로 이어집니다.
 */
export function postGraph(post: Post) {
  const url = absoluteUrl(postPath(post.slug));
  const image = post.coverImage ?? firstImage(post.body);
  const firstTag = post.tags[0];
  const crumbs = [
    { name: "글 목록", item: `${SITE_URL}/` },
    ...(firstTag ? [{ name: firstTag, item: absoluteUrl(tagPath(firstTag)) }] : []),
    { name: post.title, item: url },
  ];
  return {
    "@context": "https://schema.org",
    "@graph": [
      person(),
      website(),
      {
        "@type": "BlogPosting",
        "@id": `${url}#post`,
        mainEntityOfPage: url,
        url,
        headline: post.title,
        description: post.summary || plainText(post.body),
        inLanguage: "ko",
        ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
        dateModified: post.updatedAt,
        author: { "@id": PERSON_ID },
        publisher: { "@id": PERSON_ID },
        isPartOf: { "@id": WEBSITE_ID },
        ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
        ...(image ? { image: image.startsWith("http") ? image : absoluteUrl(image) } : {}),
        wordCount: post.body.replace(/\s+/g, " ").split(" ").length,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
      },
    ],
  };
}

/** </script> 로 스크립트를 끊고 나가지 못하게 < 를 이스케이프합니다 */
export const serializeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
