import Image from "@tiptap/extension-image";
import { joinImageSrc, splitImageSrc, type ImageAlign } from "./imageAttrs";

/** 마크다운 이미지 문법이 깨지지 않게 괄호와 띄어쓰기를 주소에서 바꿔 적습니다 */
const markdownUrl = (url: string) => url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
const markdownAlt = (text: string) => text.replace(/\\/g, "\\\\").replace(/([[\]])/g, "\\$1").replace(/\n/g, " ");
const markdownTitle = (text: string) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");

/**
 * 노션의 이미지 블록처럼 폭, 정렬, 캡션을 가집니다.
 * 캡션은 마크다운 이미지의 제목("...") 자리에, 폭과 정렬은 주소의 # 뒤에 저장합니다.
 */
export const BlogImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => {
          const src = el.getAttribute("src");
          return src ? splitImageSrc(src).url : null;
        },
        renderHTML: (attrs) => ({ src: joinImageSrc(attrs.src as string, { width: attrs.width as number | null, align: attrs.align as ImageAlign }) }),
      },
      width: {
        default: null,
        parseHTML: (el) => splitImageSrc(el.getAttribute("src") ?? "").width,
        renderHTML: () => ({}),
      },
      align: {
        default: "center",
        parseHTML: (el) => splitImageSrc(el.getAttribute("src") ?? "").align,
        renderHTML: () => ({}),
      },
    };
  },

  parseMarkdown: (token, helpers) => {
    const { url, width, align } = splitImageSrc(String(token.href ?? ""));
    return helpers.createNode("image", { src: url, width, align, title: token.title || null, alt: token.text || null });
  },

  renderMarkdown: (node) => {
    const attrs = node.attrs ?? {};
    const src = joinImageSrc(markdownUrl(String(attrs.src ?? "")), { width: (attrs.width as number | null) ?? null, align: (attrs.align as ImageAlign) ?? "center" });
    const alt = markdownAlt(String(attrs.alt ?? ""));
    const title = attrs.title ? ` "${markdownTitle(String(attrs.title))}"` : "";
    return `![${alt}](${src}${title})`;
  },
}).configure({ allowBase64: true });
