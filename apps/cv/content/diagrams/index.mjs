// 글 속 구조도: content/diagrams/<slug>.mjs 가 { 이름: svg 문자열 } 을 내보내고,
// 글에서는 ![설명](이름.svg "캡션") 한 줄로 넣습니다.
import eoullim from "./eoullim.mjs";
import frontendTools from "./frontend-tools.mjs";
import jeju from "./jeju.mjs";
import lawtimes from "./lawtimes.mjs";
import lawvax from "./lawvax.mjs";
import marketd from "./marketd.mjs";
import sogang from "./sogang.mjs";
import wareco from "./wareco.mjs";

export const diagrams = { eoullim, "frontend-tools": frontendTools, jeju, lawtimes, lawvax, marketd, sogang, wareco };
