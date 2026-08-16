import { DEFAULT_THEME_ID, THEME_IDS } from "./registry";
import { THEME_COOKIE_NAME } from "./cookie";

const allowlist = JSON.stringify(THEME_IDS);
const cookieName = JSON.stringify(THEME_COOKIE_NAME);
const fallback = JSON.stringify(DEFAULT_THEME_ID);

// This is a build-time constant, not request-derived input. It intentionally
// reads only the allowlisted, non-sensitive preference cookie before paint.
export const THEME_PREPAINT_SCRIPT = `(()=>{try{const a=${allowlist};const n=${cookieName};const f=${fallback};let v=f;for(const p of document.cookie.split(";")){const i=p.indexOf("=");if(i<0||p.slice(0,i).trim()!==n)continue;try{const c=decodeURIComponent(p.slice(i+1).trim());if(a.includes(c))v=c;}catch{}break;}document.documentElement.dataset.theme=v;}catch{document.documentElement.dataset.theme=${fallback};}})();`;
