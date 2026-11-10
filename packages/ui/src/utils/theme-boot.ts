import { CUSTOM_THEME_NAME_MAX, CUSTOM_THEME_STORAGE_KEY, CUSTOM_TOKEN_NAMES } from "./theme-custom";

/**
 * Blocking first-paint script for `<head>`: sets the `dark` class from `bloommd-theme` or the system
 * preference, then applies a stored custom theme (`bloommd-theme-custom`) on top. A broken or invalid
 * custom value is ignored, so the base theme stays. Both steps are wrapped in `try/catch`.
 *
 * The script is plain ES5 because it runs before any bundle. The colour logic is a copy of
 * `theme-custom.ts` (`validateCustomTheme` + `deriveCustomTokens` + `applyThemeToRoot`);
 * `theme-boot.test.ts` runs the script against the TypeScript version so the two cannot drift apart.
 * Keep the arithmetic expression-for-expression the same.
 */
export const THEME_BOOT_SCRIPT = [
  "(function(){",
  "var d=document.documentElement,K=", JSON.stringify(CUSTOM_THEME_STORAGE_KEY), ",N=", JSON.stringify(CUSTOM_TOKEN_NAMES), ";",
  "var D={light:['#FAFAFA','#1A1A1A'],dark:['#111111','#E8E4DF']};",
  // Base theme — identical to the former one-line script.
  "try{var s=localStorage.getItem('bloommd-theme');",
  "var k=s==='dark'||s==='light'?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;",
  "d.classList.toggle('dark',k)}catch(e){}",
  // Custom theme.
  "try{",
  "function hex(v){if(typeof v!=='string')return null;v=v.trim();",
  "if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v))return null;",
  "var g=v.slice(1).toUpperCase();return '#'+(g.length===3?g.replace(/./g,'$&$&'):g)}",
  "function rgb(h){return [1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})}",
  "function lum(h){var c=rgb(h).map(function(x){var q=x/255;return q<=0.03928?q/12.92:Math.pow((q+0.055)/1.055,2.4)});",
  "return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}",
  "function ratio(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}",
  "function mix(a,b,t){var p=rgb(a),q=rgb(b);return '#'+p.map(function(c,i){",
  "var v=Math.max(0,Math.min(255,Math.round(c+(q[i]-c)*t))).toString(16);return (v.length<2?'0':'')+v}).join('').toUpperCase()}",
  "function soft(ink,L,max){for(var n=Math.round(max*20);n>0;n--){var c=mix(ink,L[0],n/20);",
  "if(L.every(function(l){return ratio(c,l)>=4.5}))return c}return ink}",
  "function opt(v){return v===undefined||v===null||(typeof v==='string'&&v.trim()==='')?undefined:hex(v)}",
  "function read(raw){if(!raw)return null;var r=JSON.parse(raw);",
  "if(typeof r!=='object'||r===null||Array.isArray(r))return null;",
  "var n=typeof r.name==='string'?r.name.trim():'';if(!n||n.length>", String(CUSTOM_THEME_NAME_MAX), ")return null;",
  "if(r.base!=='light'&&r.base!=='dark')return null;",
  "var a=hex(r.accent);if(!a)return null;",
  "var f=opt(r.surface);if(f===null)return null;var i=opt(r.ink);if(i===null)return null;",
  "f=f||D[r.base][0];",
  "if(!i){i=D[r.base][1];if(ratio(i,f)<4.5)i=ratio('#000000',f)>=ratio('#FFFFFF',f)?'#000000':'#FFFFFF'}",
  "if(ratio(i,f)<4.5||ratio(a,f)<3)return null;",
  "return {base:r.base,a:a,f:f,i:i}}",
  "var t=read(localStorage.getItem(K));",
  "if(t){var l=lum(t.f)>=0.18,",
  "w=l?mix(t.f,'#FFFFFF',0.7):mix(t.f,'#FFFFFF',0.05),",
  "u=l?mix(t.f,'#000000',0.04):mix(t.f,'#000000',0.4),L=[t.f,w,u],",
  "V=[t.a,mix(t.a,'#FFFFFF',0.35),mix(t.f,t.a,l?0.1:0.16),mix(t.f,t.a,l?0.28:0.34),",
  "t.i,soft(t.i,L,0.3),soft(t.i,L,0.4),t.f,w,u,mix(t.f,t.i,0.12),mix(t.f,t.i,0.22)];",
  "d.classList.toggle('dark',t.base==='dark');",
  "for(var x=0;x<N.length;x++)d.style.setProperty(N[x],V[x]);",
  "d.style.colorScheme=t.base}",
  "}catch(e){}",
  "})();",
].join("");
